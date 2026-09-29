import type { ChannelSignals, PlannerIntentDetectionResult } from "../types/planner.types";

/**
 * Learned project rules (ADR 002, 0.2b follow-up, migration 125): pure helpers.
 *
 * A rule says "captures from this source go to this project". Sources are the
 * signals a channel adapter recorded on the capture; the most specific one wins.
 */

export const PROJECT_RULE_SIGNAL_TYPES = ["slack_channel", "email_sender", "email_domain"] as const;
export type ProjectRuleSignalType = (typeof PROJECT_RULE_SIGNAL_TYPES)[number];

export interface SignalCandidate {
  type: ProjectRuleSignalType;
  value: string;
  /** Display only. */
  label: string | null;
}

/** Match order: the most specific source first. */
export function signalCandidates(signals: ChannelSignals): SignalCandidate[] {
  const out: SignalCandidate[] = [];
  if (signals.slack_channel) {
    out.push({ type: "slack_channel", value: signals.slack_channel, label: signals.slack_channel_label ?? null });
  }
  if (signals.email_sender) out.push({ type: "email_sender", value: signals.email_sender, label: signals.email_sender });
  if (signals.email_domain) out.push({ type: "email_domain", value: signals.email_domain, label: `@${signals.email_domain}` });
  return out;
}

/**
 * The source a correction is learned for: the Slack channel, else the sender's
 * company domain ("everything from acme.com"), else the sender's address (a
 * public mailbox has no domain signal).
 */
export function learnableSignal(signals: ChannelSignals): SignalCandidate | null {
  const candidates = signalCandidates(signals);
  return (
    candidates.find((c) => c.type === "slack_channel") ??
    candidates.find((c) => c.type === "email_domain") ??
    candidates.find((c) => c.type === "email_sender") ??
    null
  );
}

/** Where a draft's project came from — system keys of `proposed_payload`. */
export interface ProjectProvenance {
  /** The project Nevora proposed (by rule or AI); compared at accept to detect a correction. */
  suggestedProjectId?: string;
  projectSource?: "rule" | "ai";
  /** Set when a rule proposed it, so "no project" on accept can retire that rule. */
  projectRuleId?: string;
}

/** Keys only Nevora writes; an edit can never set or drop them. */
export const PROJECT_SYSTEM_KEYS = ["suggestedProjectId", "projectSource", "projectRuleId"] as const;

export interface AppliedRule {
  ruleId: string;
  projectId: string;
}

/**
 * Stamp each draft with where its project came from. A matched rule decides the
 * project for every draft of the capture (it is the capture's source that
 * matched); otherwise the model's pick, if any, is recorded as the suggestion.
 */
export function stampProjectProvenance(
  result: PlannerIntentDetectionResult,
  rule: AppliedRule | null,
): PlannerIntentDetectionResult {
  return {
    ...result,
    suggestions: result.suggestions.map((suggestion) => {
      const payload = { ...(suggestion.proposedPayload ?? {}) };
      for (const key of PROJECT_SYSTEM_KEYS) delete payload[key];
      if (rule) {
        return {
          ...suggestion,
          proposedPayload: {
            ...payload,
            projectId: rule.projectId,
            suggestedProjectId: rule.projectId,
            projectSource: "rule",
            projectRuleId: rule.ruleId,
          },
        };
      }
      const projectId = typeof payload.projectId === "string" ? payload.projectId : null;
      return {
        ...suggestion,
        proposedPayload: projectId ? { ...payload, suggestedProjectId: projectId, projectSource: "ai" } : payload,
      };
    }),
  };
}

/**
 * The payload an edit writes: the user's keys, with Nevora's provenance keys
 * taken from the stored payload — so the accept-time comparison cannot be
 * forged or lost by an edit.
 */
export function preserveProjectProvenance(
  next: Record<string, unknown>,
  current: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out = { ...next };
  for (const key of PROJECT_SYSTEM_KEYS) {
    delete out[key];
    if (current && current[key] !== undefined) out[key] = current[key];
  }
  return out;
}

/** What accepting a draft teaches: nothing, a rule (source → project), or forgetting one. */
export type ProjectRuleLesson =
  | { kind: "none" }
  | { kind: "learn"; signal: SignalCandidate; projectId: string }
  | { kind: "forget"; ruleId: string };

/**
 * Decide the lesson of an accepted draft. Only a CORRECTION teaches: the user
 * filed it under a different project than Nevora proposed. Clearing a project a
 * rule set retires that rule; clearing an AI guess teaches nothing.
 */
export function projectRuleLesson(
  payload: Record<string, unknown>,
  signals: ChannelSignals,
  acceptedProjectId: string | null,
): ProjectRuleLesson {
  const proposed = typeof payload.suggestedProjectId === "string" ? payload.suggestedProjectId : null;
  if (acceptedProjectId === proposed) return { kind: "none" };

  if (!acceptedProjectId) {
    const ruleId = payload.projectSource === "rule" && typeof payload.projectRuleId === "string" ? payload.projectRuleId : null;
    return ruleId ? { kind: "forget", ruleId } : { kind: "none" };
  }

  const signal = learnableSignal(signals);
  return signal ? { kind: "learn", signal, projectId: acceptedProjectId } : { kind: "none" };
}

/** Read a stored `channel_signals` value defensively (it is JSON from the database). */
export function readChannelSignals(value: unknown): ChannelSignals {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const text = (key: string) => (typeof record[key] === "string" && record[key] ? (record[key] as string) : undefined);
  const signals: ChannelSignals = {};
  const slack = text("slack_channel");
  if (slack) signals.slack_channel = slack;
  const slackLabel = text("slack_channel_label");
  if (slackLabel) signals.slack_channel_label = slackLabel;
  const sender = text("email_sender");
  if (sender) signals.email_sender = sender.toLowerCase();
  const domain = text("email_domain");
  if (domain) signals.email_domain = domain.toLowerCase();
  return signals;
}
