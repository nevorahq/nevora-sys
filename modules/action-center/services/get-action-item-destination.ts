import { ROUTES } from "@/shared/config/routes";
import type { ActionItem } from "../types/action-item.types";

/**
 * Where a read-only Action Center row navigates. The Action Center owns attention
 * and routing, not mutation — every row's single operation is "open the owning
 * module", where the entity is actually managed.
 *
 * `target` is the owning surface (used for the link label + tests); `href` is the
 * concrete existing route, or null when the source is unknown, deleted or has no
 * usable id — the row must then render as plain text, never a broken link.
 */
export type ActionItemDestinationTarget =
  | "inbox_review"
  | "tasks"
  | "money"
  | "subscriptions"
  | "documents"
  | "none";

export interface ActionItemDestination {
  href: string | null;
  target: ActionItemDestinationTarget;
}

const NONE: ActionItemDestination = { href: null, target: "none" };

/** The subset of an action item the destination is derived from. */
export type ActionItemDestinationInput = Pick<
  ActionItem,
  "source_type" | "type" | "primary_entity_type" | "primary_entity_id" | "metadata"
>;

function metaString(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * True when the item stands for a Planner capture, mirroring the classification
 * used by the (now removed) Action Center quick actions: an AI-sourced signal
 * whose primary entity is a planner_entry / planner_suggestion, or whose metadata
 * carries the planner marker.
 */
function isPlanner(item: ActionItemDestinationInput): boolean {
  if (item.primary_entity_type === "planner_entry" || item.primary_entity_type === "planner_suggestion") return true;
  if (item.source_type !== "ai") return false;
  return metaString(item.metadata, "source") === "planner" || metaString(item.metadata, "planner_entry_id") !== null;
}

/** A source the user deleted is stamped by recordTaskDeletionInActionCenter. */
function sourceIsDeleted(item: ActionItemDestinationInput): boolean {
  return item.metadata?.task_deleted === true || metaString(item.metadata, "source") === "task_delete";
}

/**
 * Resolve the owning-module destination for an action item. Pure and total: it
 * only ever returns an existing route (from ROUTES) or null. It never invents a
 * path and never throws.
 */
export function getActionItemDestination(item: ActionItemDestinationInput): ActionItemDestination {
  if (sourceIsDeleted(item)) return NONE;

  // Planner captures route to the exact Inbox Review, not a generic surface.
  if (isPlanner(item)) {
    if (item.primary_entity_type === "planner_suggestion" && item.primary_entity_id) {
      return { href: `${ROUTES.inbox}?tab=review&suggestion=${item.primary_entity_id}`, target: "inbox_review" };
    }
    // A planner_entry (or metadata-only planner signal) has no suggestion to focus
    // yet — open the Review tab so the user lands on the capture queue.
    return { href: `${ROUTES.inbox}?tab=review`, target: "inbox_review" };
  }

  // Business entities: prefer the primary entity pointer, fall back to a
  // document pointer carried in metadata (document-derived financial signals).
  const entityType = item.primary_entity_type ?? item.source_type;
  const entityId = item.primary_entity_id ?? metaString(item.metadata, "source_document_id");

  switch (entityType) {
    case "task":
      return entityId ? { href: `${ROUTES.tasks}/${entityId}`, target: "tasks" } : NONE;
    case "transaction":
      return entityId ? { href: `${ROUTES.money}/${entityId}`, target: "money" } : NONE;
    case "subscription":
      return entityId ? { href: `${ROUTES.subscriptions}/${entityId}`, target: "subscriptions" } : NONE;
    case "document":
      return entityId ? { href: `${ROUTES.documents}/${entityId}`, target: "documents" } : NONE;
    default:
      return NONE;
  }
}
