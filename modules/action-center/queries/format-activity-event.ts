/**
 * Turn a raw domain event name into a readable label + a kind (create / update /
 * delete / other) for the Activity Log. Pure module — shared by the UI and tests.
 *
 * A generic prettifier covers every event ("money.transaction.created" →
 * "Money transaction created"); a small override map improves the highest-volume
 * ones. Nothing here needs to be exhaustive — unknown events still render nicely.
 */

export type ActivityKind = "create" | "update" | "delete" | "other";

const LABEL_OVERRIDES: Record<string, string> = {
  "task.created": "Task created",
  "task.updated": "Task updated",
  "task.completed": "Task completed",
  "task.deleted": "Task deleted",
  "task.due_date_changed": "Task due date changed",
  "money.transaction.created": "Payment recorded",
  "money.transaction.draft_created": "Draft payment created",
  "transaction.deleted": "Payment deleted",
  "money.transfer.created": "Transfer created",
  "subscription.created": "Subscription created",
  "subscription.deleted": "Subscription deleted",
  "subscription.renewed": "Subscription renewed",
  "document.created": "Document created",
  "document.deleted": "Document deleted",
  "planner_entry.created": "Inbox capture",
  "planner_entry.deleted": "Inbox entry deleted",
  "planner_suggestion.accepted": "Inbox suggestion accepted",
  "planner_suggestion.rejected": "Inbox suggestion rejected",
  "action_item.resolved": "Action resolved",
  "action_item.dismissed": "Action dismissed",
  "action_item.restored": "Action restored",
};

/** Internal lifecycle noise — hidden from the log by default. */
const HIDDEN_EVENTS = new Set<string>([
  "planner_entry.processing_started",
  "planner_entry.processed",
  "document.extraction.started",
  "document.extraction.completed",
  "document.extraction.failed",
  "money.transaction.categorization_requested",
  "money.transaction.auto_categorization_requested",
  "action_center.item_created",
]);

export function isHiddenActivityEvent(eventName: string): boolean {
  return HIDDEN_EVENTS.has(eventName);
}

export function activityKind(eventName: string): ActivityKind {
  const action = eventName.split(".").pop() ?? "";
  if (/(^|_)(created|added|recorded|captured)$/.test(action)) return "create";
  if (action === "deleted" || action.endsWith("_deleted")) return "delete";
  if (/(updated|changed|renewed|completed|resolved|paid|confirmed)$/.test(action)) return "update";
  return "other";
}

export function prettifyEventName(eventName: string): string {
  const words = eventName.replace(/[._]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function activityLabel(eventName: string): string {
  return LABEL_OVERRIDES[eventName] ?? prettifyEventName(eventName);
}
