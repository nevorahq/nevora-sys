/**
 * Capture Inbox — domain types.
 *
 * Mirror the CHECK dictionaries of migration 080. The planner layer is a thin
 * input surface: these types describe the raw capture and the AI proposal, never
 * the business entities they eventually become (those live in their own modules).
 */

// ── planner_entries ──────────────────────────────────────────────────────────

export const PLANNER_ENTRY_TYPES = ["text", "file", "photo", "link", "voice", "document"] as const;
export type PlannerEntryType = (typeof PLANNER_ENTRY_TYPES)[number];

export const PLANNER_ENTRY_SOURCES = ["manual", "document", "subscription", "money", "task", "system"] as const;
export type PlannerEntrySource = (typeof PLANNER_ENTRY_SOURCES)[number];

export const PLANNER_ENTRY_STATUSES = [
  "captured",
  "processing",
  "suggested",
  "accepted",
  "rejected",
  "archived",
  "failed",
] as const;
export type PlannerEntryStatus = (typeof PLANNER_ENTRY_STATUSES)[number];

export interface PlannerEntry {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  raw_text: string | null;
  entry_type: PlannerEntryType;
  source: PlannerEntrySource;
  status: PlannerEntryStatus;
  ai_detected_intent: string | null;
  ai_confidence: number | null;
  source_document_id: string | null;
  source_task_id: string | null;
  source_subscription_id: string | null;
  source_transaction_id: string | null;
  source_project_id: string | null;
  created_by: string;
  /** Owner of this private capture (migration 087). Equals created_by. */
  owner_user_id: string;
  /** 'private' (default) — only the owner sees it; 'organization' reserved for future shared captures. */
  visibility: "private" | "organization";
  created_at: string;
  updated_at: string;
}

export const PLANNER_ENTRY_COLUMNS =
  "id, organization_id, workspace_id, raw_text, entry_type, source, status, ai_detected_intent, ai_confidence, source_document_id, source_task_id, source_subscription_id, source_transaction_id, source_project_id, created_by, owner_user_id, visibility, created_at, updated_at" as const;

// ── planner_suggestions ──────────────────────────────────────────────────────

export const PLANNER_SUGGESTION_TYPES = [
  "create_task",
  "create_financial_task",
  "create_document",
  "create_subscription_reminder",
  "create_money_reminder",
  "link_entities",
  "assign_project",
  "create_project",
  "create_action_item",
] as const;
export type PlannerSuggestionType = (typeof PLANNER_SUGGESTION_TYPES)[number];

export const PLANNER_SUGGESTION_STATUSES = [
  "pending",
  /**
   * Transient claim held by an in-flight accept (migration 094). Exactly one
   * caller can move pending|edited -> processing, which is what makes a confirm
   * once-only. Never reviewable: the Inbox queue filters on pending|edited.
   */
  "processing",
  "accepted",
  "edited",
  "rejected",
  "expired",
  "failed",
] as const;
export type PlannerSuggestionStatus = (typeof PLANNER_SUGGESTION_STATUSES)[number];

/** Statuses a user may still accept / edit / reject. */
export const PLANNER_SUGGESTION_OPEN_STATUSES = ["pending", "edited"] as const satisfies readonly PlannerSuggestionStatus[];

/**
 * Suggestion types that carry money semantics. On accept they route to the
 * money-safe financial-task service and can NEVER post a transaction.
 */
export const FINANCIAL_SUGGESTION_TYPES: readonly PlannerSuggestionType[] = [
  "create_financial_task",
  "create_money_reminder",
  "create_subscription_reminder",
] as const;

export function isFinancialSuggestionType(type: PlannerSuggestionType): boolean {
  return FINANCIAL_SUGGESTION_TYPES.includes(type);
}

export interface PlannerSuggestion {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  planner_entry_id: string;
  suggestion_type: PlannerSuggestionType;
  title: string;
  description: string | null;
  proposed_payload: Record<string, unknown>;
  confidence: number;
  status: PlannerSuggestionStatus;
  accepted_entity_type: string | null;
  accepted_entity_id: string | null;
  reject_reason: string | null;
  /** Set only while status is 'processing' (migration 094 keeps the two in lockstep). */
  claimed_at: string | null;
  created_by: string;
  /** Owner of this private suggestion (migration 087). Equals created_by. */
  owner_user_id: string;
  /** 'private' (default) — only the owner sees it; 'organization' reserved for future shared captures. */
  visibility: "private" | "organization";
  created_at: string;
  updated_at: string;
}

export const PLANNER_SUGGESTION_COLUMNS =
  "id, organization_id, workspace_id, planner_entry_id, suggestion_type, title, description, proposed_payload, confidence, status, accepted_entity_type, accepted_entity_id, reject_reason, claimed_at, created_by, owner_user_id, visibility, created_at, updated_at" as const;

// ── Confidence policy (spec §15; mirrors document obligation bands) ───────────

/** >= this: suggestion is review-ready as-is. */
export const SUGGESTION_READY_FLOOR = 0.85;
/** >= this (and < ready): pending but flagged needs_review / missing info. */
export const SUGGESTION_SUGGEST_FLOOR = 0.6;

export type ConfidenceBand = "ready" | "needs_review" | "insufficient";

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= SUGGESTION_READY_FLOOR) return "ready";
  if (confidence >= SUGGESTION_SUGGEST_FLOOR) return "needs_review";
  return "insufficient";
}

// ── AI intent detection result (validated before it touches the DB) ──────────

export interface DetectedSuggestion {
  suggestionType: PlannerSuggestionType;
  title: string;
  description?: string;
  proposedPayload: Record<string, unknown>;
  confidence: number;
}

export interface PlannerIntentDetectionResult {
  detectedIntent: string;
  confidence: number;
  suggestions: DetectedSuggestion[];
  missingInformation?: string[];
}

// ── Inbox dashboard aggregation (Inbox / Review MVP tabs) ────────────────────

export const INBOX_TABS = ["inbox", "review"] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

export interface PlannerEntryWithSuggestions extends PlannerEntry {
  suggestions: PlannerSuggestion[];
}

/** The subset of a capture the review UI needs to answer "why was this proposed?". */
export type DraftOriginEntry = Pick<PlannerEntry, "source" | "raw_text" | "ai_detected_intent">;

/**
 * A suggestion awaiting a decision, paired with the capture it came from. The
 * pairing is what lets the card explain its own origin (Phase B / B3) without a
 * second query per card.
 */
export interface PendingDraft {
  suggestion: PlannerSuggestion;
  /** Null when the capture fell outside the entries page (rare, older captures). */
  entry: DraftOriginEntry | null;
}

export interface InboxDashboardData {
  /** Recent captures (any status), newest first. */
  entries: PlannerEntryWithSuggestions[];
  /** Suggestions awaiting a decision (status pending | edited), with their origin. */
  pendingDrafts: PendingDraft[];
  counts: {
    captured: number;
    pending: number;
  };
}
