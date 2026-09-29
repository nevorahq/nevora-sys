import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { uuidSchema } from "@/lib/validators/common";
import type { ChannelSignals, PlannerSuggestion } from "../types/planner.types";
import {
  projectRuleLesson,
  readChannelSignals,
  signalCandidates,
  type AppliedRule,
  type ProjectRuleLesson,
} from "../utils/project-rule-signals";

/**
 * Learned project rules (migration 125). Every read and write is scoped to the
 * organization AND the user of the context: rules are private, and the channel
 * path runs on the service role, where RLS does not do that scoping.
 *
 * Everything here is best-effort. A database without migration 125, or any
 * failed read, means "no rule" — classification falls back to AI, and a capture
 * or an accept never fails because of a rule.
 */

/** The source a capture recorded, or {} (an in-app capture, or no migration 125). */
export async function loadEntrySignals(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  entryId: string,
): Promise<ChannelSignals> {
  const { data, error } = await supabase
    .from("planner_entries")
    .select("channel_signals")
    .eq("id", entryId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (error || !data) return {};
  return readChannelSignals((data as { channel_signals?: unknown }).channel_signals);
}

/**
 * The user's rule for the most specific matching source whose project is still
 * live (in `liveProjectIds`: not archived, not completed). Bumps its usage.
 */
export async function matchProjectRule(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  signals: ChannelSignals,
  liveProjectIds: ReadonlySet<string>,
): Promise<AppliedRule | null> {
  const candidates = signalCandidates(signals);
  if (candidates.length === 0 || liveProjectIds.size === 0) return null;

  const { data, error } = await supabase
    .from("capture_project_rules")
    .select("id, signal_type, signal_value, project_id, hits")
    .eq("organization_id", ctx.org.id)
    .eq("owner_user_id", ctx.user.id)
    .in("signal_value", candidates.map((candidate) => candidate.value));
  if (error || !data) return null;

  const rows = data as Array<{ id: string; signal_type: string; signal_value: string; project_id: string; hits: number }>;
  for (const candidate of candidates) {
    const row = rows.find((r) => r.signal_type === candidate.type && r.signal_value === candidate.value);
    if (!row || !liveProjectIds.has(row.project_id)) continue;

    const { error: bumpError } = await supabase
      .from("capture_project_rules")
      .update({ hits: (row.hits ?? 0) + 1, last_used_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("organization_id", ctx.org.id)
      .eq("owner_user_id", ctx.user.id);
    if (bumpError) console.error("[matchProjectRule] usage bump failed:", bumpError.message);
    return { ruleId: row.id, projectId: row.project_id };
  }
  return null;
}

/** Apply what an accepted draft taught (see projectRuleLesson). Never throws. */
export async function applyProjectRuleLesson(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  lesson: ProjectRuleLesson,
): Promise<void> {
  try {
    if (lesson.kind === "learn") {
      const { error } = await supabase.from("capture_project_rules").upsert(
        {
          organization_id: ctx.org.id,
          owner_user_id: ctx.user.id,
          signal_type: lesson.signal.type,
          signal_value: lesson.signal.value,
          signal_label: lesson.signal.label,
          project_id: lesson.projectId,
        },
        { onConflict: "organization_id,owner_user_id,signal_type,signal_value" },
      );
      if (error) console.error("[applyProjectRuleLesson] learn failed:", error.message);
    } else if (lesson.kind === "forget") {
      const { error } = await supabase
        .from("capture_project_rules")
        .delete()
        .eq("id", lesson.ruleId)
        .eq("organization_id", ctx.org.id)
        .eq("owner_user_id", ctx.user.id);
      if (error) console.error("[applyProjectRuleLesson] forget failed:", error.message);
    }
  } catch (error) {
    console.error("[applyProjectRuleLesson] failed:", error instanceof Error ? error.message : String(error));
  }
}

/**
 * After a draft was accepted into a task: if the user filed it under another
 * project than Nevora proposed, remember that for the capture's source (or
 * retire the rule that proposed it, when they cleared the project).
 */
export async function learnProjectRuleFromAccept(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  suggestion: Pick<PlannerSuggestion, "planner_entry_id" | "proposed_payload">,
): Promise<void> {
  const payload = suggestion.proposed_payload ?? {};
  const parsed = uuidSchema.safeParse(payload.projectId);
  const accepted = parsed.success ? parsed.data : null;
  // Nothing proposed and nothing chosen: nothing to learn, no read needed.
  if (!accepted && typeof payload.suggestedProjectId !== "string") return;

  const signals = await loadEntrySignals(supabase, ctx, suggestion.planner_entry_id);
  await applyProjectRuleLesson(supabase, ctx, projectRuleLesson(payload, signals, accepted));
}

export interface MyProjectRule {
  id: string;
  signalType: "slack_channel" | "email_sender" | "email_domain";
  signalValue: string;
  signalLabel: string | null;
  projectId: string;
  projectName: string | null;
  hits: number;
  lastUsedAt: string | null;
}

/** The signed-in user's rules for Settings, most used first. [] before migration 125. */
export async function listMyProjectRules(supabase: SupabaseClient, ctx: CurrentContext): Promise<MyProjectRule[]> {
  const { data, error } = await supabase
    .from("capture_project_rules")
    .select("id, signal_type, signal_value, signal_label, project_id, hits, last_used_at, project:projects(name)")
    .eq("organization_id", ctx.org.id)
    .eq("owner_user_id", ctx.user.id)
    .order("hits", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];

  return (data as unknown as Array<Record<string, unknown>>).map((row) => {
    const project = Array.isArray(row.project) ? row.project[0] : row.project;
    return {
      id: row.id as string,
      signalType: row.signal_type as MyProjectRule["signalType"],
      signalValue: row.signal_value as string,
      signalLabel: (row.signal_label as string | null) ?? null,
      projectId: row.project_id as string,
      projectName: ((project as { name?: string } | null)?.name ?? null) || null,
      hits: Number(row.hits ?? 0),
      lastUsedAt: (row.last_used_at as string | null) ?? null,
    };
  });
}
