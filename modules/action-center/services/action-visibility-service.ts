import type { ActionItem, ActionItemStatus } from "../types/action-item.types";
import type { AvailableAction } from "../types/action-center.types";

/**
 * Action Visibility (permission-aware).
 *
 * Чистая функция: по item + множеству permissions решает, какие quick actions
 * показать. Опасные/финансовые действия помечаются requiresConfirmation и
 * требуют узкого permission (execute.financial / .subscription / ...).
 *
 * Безопасность UI — здесь; реальный guard — в самих мутациях (canDo + RLS).
 */

const TERMINAL: ActionItemStatus[] = ["resolved", "dismissed", "cancelled"];

export function getAvailableActions(
  item: Pick<ActionItem, "type" | "status" | "source_type"> & Partial<Pick<ActionItem, "metadata" | "primary_entity_type">>,
  permissions: ReadonlySet<string>,
): AvailableAction[] {
  const actions: AvailableAction[] = [];
  const isTerminal = TERMINAL.includes(item.status);
  const has = (p: string) => permissions.has(p);

  if (!isTerminal) {
    // ── Safe actions ──────────────────────────────────────
    if (has("action_center.resolve")) {
      actions.push({ kind: "resolve", label: "Resolve", requiresConfirmation: false, permission: "action_center.resolve" });
      if (item.status === "open") {
        actions.push({ kind: "snooze", label: "Snooze", requiresConfirmation: false, permission: "action_center.resolve" });
      }
    }
    if (has("action_center.dismiss")) {
      actions.push({ kind: "dismiss", label: "Dismiss", requiresConfirmation: false, permission: "action_center.dismiss" });
    }
    if (has("action_center.assign")) {
      actions.push({ kind: "assign", label: "Assign", requiresConfirmation: false, permission: "action_center.assign" });
    }

    // ── Safe execute: create task draft из сигнала ────────
    if (
      has("action_center.execute") &&
      (item.type === "ai_suggestion" || item.type === "missing_relation" || item.type === "follow_up_required")
    ) {
      actions.push({
        kind: "execute",
        executeKind: "create_task_draft",
        label: "Create task draft",
        requiresConfirmation: false,
        permission: "action_center.execute",
      });
    }

    // ── Dangerous execute (confirmation + scoped permission) ──
    if (item.source_type === "transaction" && item.type === "draft_review" && has("action_center.execute.financial")) {
      actions.push({
        kind: "execute",
        executeKind: "confirm_transaction",
        label: "Confirm transaction",
        requiresConfirmation: true,
        permission: "action_center.execute.financial",
      });
    }
    if (item.source_type === "subscription" && has("action_center.execute.subscription")) {
      actions.push({
        kind: "execute",
        executeKind: "cancel_subscription",
        label: "Cancel subscription",
        requiresConfirmation: true,
        permission: "action_center.execute.subscription",
      });
    }

    if (item.source_type === "task" && has("data.delete")) {
      actions.push({
        kind: "execute",
        executeKind: "delete_task",
        label: "Delete task",
        requiresConfirmation: true,
        permission: "data.delete",
      });
    }
    if (item.source_type === "subscription" && has("data.delete")) {
      actions.push({
        kind: "execute",
        executeKind: "delete_subscription",
        label: "Delete subscription",
        requiresConfirmation: true,
        permission: "data.delete",
      });
    }
    if (isPlannerAction(item) && has("planner.entry.delete")) {
      actions.push({
        kind: "execute",
        executeKind: "delete_planner_entry",
        label: "Delete Inbox entry",
        requiresConfirmation: true,
        permission: "planner.entry.delete",
      });
    }
  }

  return actions;
}

/** Доступен ли конкретный execute kind (для серверной перепроверки в executor). */
export function executePermissionFor(executeKind: string): { permission: string; dangerous: boolean } {
  switch (executeKind) {
    case "create_task_draft":
      return { permission: "action_center.execute", dangerous: false };
    case "confirm_transaction":
      return { permission: "action_center.execute.financial", dangerous: true };
    case "cancel_subscription":
      return { permission: "action_center.execute.subscription", dangerous: true };
    case "approve_document":
      return { permission: "action_center.execute.document_approval", dangerous: true };
    case "delete_task":
    case "delete_subscription":
      return { permission: "data.delete", dangerous: true };
    case "delete_planner_entry":
      return { permission: "planner.entry.delete", dangerous: true };
    default:
      return { permission: "action_center.execute", dangerous: true };
  }
}

function isPlannerAction(
  item: Pick<ActionItem, "source_type"> & Partial<Pick<ActionItem, "metadata" | "primary_entity_type">>,
): boolean {
  if (item.source_type !== "ai") return false;
  if (item.primary_entity_type === "planner_entry" || item.primary_entity_type === "planner_suggestion") return true;
  const metadata = item.metadata;
  return metadata?.source === "planner" || typeof metadata?.planner_entry_id === "string";
}
