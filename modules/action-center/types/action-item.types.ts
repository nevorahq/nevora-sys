/**
 * Action Center — доменные типы.
 *
 * Соответствуют колонкам public.action_items (+ links/events).
 * Enums зеркалят CHECK-констрейнты миграции 048.
 */

export const ACTION_ITEM_TYPES = [
  "approval_required",
  "due_soon",
  "overdue",
  "missing_information",
  "missing_relation",
  "draft_review",
  "ai_suggestion",
  "risk_detected",
  "payment_required",
  "renewal_required",
  "assignment_required",
  "document_review",
  "follow_up_required",
] as const;
export type ActionItemType = (typeof ACTION_ITEM_TYPES)[number];

export const ACTION_ITEM_STATUSES = [
  "open",
  "in_progress",
  "snoozed",
  "resolved",
  "dismissed",
  "cancelled",
  "failed",
] as const;
export type ActionItemStatus = (typeof ACTION_ITEM_STATUSES)[number];

export const ACTION_ITEM_PRIORITIES = ["critical", "high", "medium", "low", "info"] as const;
export type ActionItemPriority = (typeof ACTION_ITEM_PRIORITIES)[number];

export const ACTION_SOURCE_TYPES = [
  "task",
  "document",
  "transaction",
  "subscription",
  "crm",
  "automation",
  "ai",
  "system",
] as const;
export type ActionSourceType = (typeof ACTION_SOURCE_TYPES)[number];

export const ACTION_LINK_RELATION_TYPES = [
  "primary",
  "related",
  "suggested",
  "source",
  "result",
] as const;
export type ActionLinkRelationType = (typeof ACTION_LINK_RELATION_TYPES)[number];

/** UI-секции фида. */
export const ACTION_SECTIONS = [
  "due_soon",
  "waiting_for_action",
  "missing_information",
  "ai_suggestions",
  "recently_resolved",
] as const;
export type ActionSection = (typeof ACTION_SECTIONS)[number];

/**
 * Phase B / B5 UI sections. A re-grouping of the taxonomy above into the three
 * questions a daily screen must answer: what needs a decision, what needs doing,
 * what just happened. See services/phase-b-sections.ts for the mapping.
 */
export const PHASE_B_SECTIONS = ["needs_your_review", "next_actions", "recently_updated"] as const;
export type PhaseBSection = (typeof PHASE_B_SECTIONS)[number];

/** Sections holding live work. `recently_updated` is history and is never selectable. */
export const ACTIVE_PHASE_B_SECTIONS = ["needs_your_review", "next_actions"] as const;

/** type → секция (recently_resolved определяется по статусу, не по type). */
export const TYPE_SECTION: Record<ActionItemType, Exclude<ActionSection, "recently_resolved">> = {
  due_soon: "due_soon",
  overdue: "due_soon",
  renewal_required: "due_soon",
  payment_required: "due_soon",
  approval_required: "waiting_for_action",
  draft_review: "waiting_for_action",
  document_review: "waiting_for_action",
  follow_up_required: "waiting_for_action",
  assignment_required: "missing_information",
  missing_information: "missing_information",
  missing_relation: "missing_information",
  ai_suggestion: "ai_suggestions",
  risk_detected: "ai_suggestions",
};

export interface ActionItem {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  title: string;
  description: string | null;
  type: ActionItemType;
  status: ActionItemStatus;
  priority: ActionItemPriority;
  priority_score: number;
  source_type: ActionSourceType;
  source_id: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  review_state: "detected" | "suggested" | "waiting_confirmation" | "confirmed" | "rejected" | null;
  suggestion_id: string | null;
  relation_id: string | null;
  source_event_id: string | null;
  primary_entity_type: string | null;
  primary_entity_id: string | null;
  due_at: string | null;
  snoozed_until: string | null;
  resolved_at: string | null;
  dismissed_at: string | null;
  assigned_to: string | null;
  created_by: string | null;
  ai_generated: boolean;
  ai_confidence: number | null;
  ai_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Колонки для select (без select("*")). */
export const ACTION_ITEM_COLUMNS =
  "id, organization_id, workspace_id, title, description, type, status, priority, priority_score, source_type, source_id, source_entity_type, source_entity_id, review_state, suggestion_id, relation_id, source_event_id, primary_entity_type, primary_entity_id, due_at, snoozed_until, resolved_at, dismissed_at, assigned_to, created_by, ai_generated, ai_confidence, ai_reason, metadata, created_at, updated_at" as const;

export interface ActionItemLink {
  id: string;
  action_item_id: string;
  entity_type: string;
  entity_id: string;
  relation_type: ActionLinkRelationType;
  created_at: string;
}

export interface ActionItemEvent {
  id: string;
  action_item_id: string;
  event_name: string;
  old_status: string | null;
  new_status: string | null;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };
