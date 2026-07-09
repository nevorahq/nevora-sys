import type {
  ActionItemType,
  ActionSourceType,
  PhaseBSection,
} from "../types/action-item.types";

/**
 * Phase B / B5 section headings. The three answer "what needs a decision", "what
 * needs doing", "what just happened" — in that order, which is the render order.
 *
 * These replaced SECTION_LABELS/SECTION_ORDER, which labelled the raw
 * `ActionSection` taxonomy. That taxonomy still exists as the query's transport
 * shape (see TYPE_SECTION), it just no longer reaches the screen.
 */
export const PHASE_B_SECTION_LABELS: Record<PhaseBSection, string> = {
  needs_your_review: "Needs your review",
  money_attention: "Money attention",
  next_actions: "Next actions",
  recently_updated: "Recently updated",
};

/**
 * One-line explainer under a section heading. Only Money attention carries one:
 * it groups by TOPIC rather than by the review/work question, so a word about what
 * lands there — and, when it is empty, what a clear-of-money-issues day looks like —
 * keeps it from reading as an arbitrary bucket.
 */
export const PHASE_B_SECTION_DESCRIPTIONS: Partial<Record<PhaseBSection, string>> = {
  money_attention: "Uncategorized, unusual, overdue or upcoming money — and drafts awaiting your confirmation.",
};

export const TYPE_LABELS: Record<ActionItemType, string> = {
  approval_required: "Approval required",
  due_soon: "Due soon",
  overdue: "Overdue",
  missing_information: "Missing information",
  missing_relation: "Missing link",
  draft_review: "Draft review",
  ai_suggestion: "AI suggestion",
  risk_detected: "Risk detected",
  payment_required: "Payment required",
  renewal_required: "Renewal",
  assignment_required: "Needs assignee",
  document_review: "Document review",
  follow_up_required: "Follow-up",
};

/**
 * Badge shown on a feed card whose source entity was DELETED (currently only
 * task deletions stamp `metadata.task_deleted`). Kept as a constant to match the
 * module's label style and stay trivially translatable.
 */
export const DELETED_MARKER_LABEL = "Deleted";

/** Label for the "Restore" control on resolved/dismissed cards. */
export const RESTORE_LABEL = "Restore";

export const SOURCE_LABELS: Record<ActionSourceType, string> = {
  task: "Task",
  document: "Document",
  transaction: "Money",
  subscription: "Subscription",
  crm: "CRM",
  automation: "Automation",
  ai: "AI",
  system: "System",
};
