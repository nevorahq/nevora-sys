import { describe, it, expect } from "vitest";
import { getAvailableActions, executePermissionFor } from "./action-visibility-service";

const memberPerms = new Set(["action_center.view", "action_center.resolve", "action_center.dismiss", "action_center.execute"]);
const adminPerms = new Set([
  ...memberPerms,
  "action_center.assign",
  "action_center.execute.financial",
  "action_center.execute.subscription",
  "data.delete",
  "planner.entry.delete",
]);

describe("getAvailableActions", () => {
  it("открытый ai_suggestion даёт safe-набор для member", () => {
    const actions = getAvailableActions({ type: "ai_suggestion", status: "open", source_type: "ai" }, memberPerms);
    const kinds = actions.map((a) => a.kind);
    expect(kinds).toContain("resolve");
    expect(kinds).toContain("snooze");
    expect(kinds).toContain("dismiss");
    expect(actions.some((a) => a.executeKind === "create_task_draft")).toBe(true);
    expect(kinds).not.toContain("assign"); // нет permission
  });

  it("терминальный статус не даёт действий", () => {
    expect(getAvailableActions({ type: "overdue", status: "resolved", source_type: "task" }, adminPerms)).toHaveLength(0);
    expect(getAvailableActions({ type: "overdue", status: "dismissed", source_type: "task" }, adminPerms)).toHaveLength(0);
  });

  it("dangerous execute требует scoped permission + помечен confirmation", () => {
    const sub = getAvailableActions({ type: "renewal_required", status: "open", source_type: "subscription" }, adminPerms);
    const cancel = sub.find((a) => a.executeKind === "cancel_subscription");
    expect(cancel).toBeDefined();
    expect(cancel?.requiresConfirmation).toBe(true);

    // без execute.subscription — действия cancel нет
    const sub2 = getAvailableActions({ type: "renewal_required", status: "open", source_type: "subscription" }, memberPerms);
    expect(sub2.some((a) => a.executeKind === "cancel_subscription")).toBe(false);
  });

  it("показывает destructive delete actions только при доменных delete permissions", () => {
    const task = getAvailableActions({ type: "overdue", status: "open", source_type: "task" }, adminPerms);
    expect(task.find((a) => a.executeKind === "delete_task")).toMatchObject({
      requiresConfirmation: true,
      permission: "data.delete",
    });

    const subscription = getAvailableActions({ type: "renewal_required", status: "open", source_type: "subscription" }, adminPerms);
    expect(subscription.find((a) => a.executeKind === "delete_subscription")).toMatchObject({
      requiresConfirmation: true,
      permission: "data.delete",
    });

    const inbox = getAvailableActions({
      type: "missing_information",
      status: "open",
      source_type: "ai",
      primary_entity_type: "planner_entry",
      metadata: { source: "planner", planner_entry_id: "entry-a" },
    }, adminPerms);
    expect(inbox.find((a) => a.executeKind === "delete_planner_entry")).toMatchObject({
      requiresConfirmation: true,
      permission: "planner.entry.delete",
    });

    const memberTask = getAvailableActions({ type: "overdue", status: "open", source_type: "task" }, memberPerms);
    expect(memberTask.some((a) => a.executeKind === "delete_task")).toBe(false);
  });

  it("planner-backed ai_suggestion opens the exact Inbox review, never a generic task draft", () => {
    const actions = getAvailableActions(
      {
        type: "ai_suggestion",
        status: "open",
        source_type: "ai",
        primary_entity_type: "planner_suggestion",
        primary_entity_id: "sugg-1",
        metadata: { source: "planner", planner_entry_id: "entry-1", suggestion_type: "create_task" },
      },
      adminPerms,
    );
    // The generic execute path must NOT be offered for a capture-origin signal.
    expect(actions.some((a) => a.executeKind === "create_task_draft")).toBe(false);
    // Instead: a link straight to the suggestion's Review card.
    const link = actions.find((a) => a.kind === "link");
    expect(link).toBeDefined();
    expect(link?.href).toBe("/dashboard/inbox?tab=review&suggestion=sugg-1");
  });

  it("planner missing-information (failed capture) opens the Inbox, not a task draft", () => {
    const actions = getAvailableActions(
      {
        type: "missing_information",
        status: "open",
        source_type: "ai",
        primary_entity_type: "planner_entry",
        primary_entity_id: "entry-9",
        metadata: { source: "planner", planner_entry_id: "entry-9" },
      },
      adminPerms,
    );
    expect(actions.some((a) => a.executeKind === "create_task_draft")).toBe(false);
    expect(actions.find((a) => a.kind === "link")?.href).toBe("/dashboard/inbox");
  });

  it("non-planner AI signal keeps its generic task-draft action", () => {
    const actions = getAvailableActions(
      { type: "ai_suggestion", status: "open", source_type: "ai", primary_entity_type: "subscription", primary_entity_id: "sub-1" },
      adminPerms,
    );
    expect(actions.some((a) => a.executeKind === "create_task_draft")).toBe(true);
    expect(actions.some((a) => a.kind === "link")).toBe(false);
  });

  it("снуз доступен только из open", () => {
    const inProgress = getAvailableActions({ type: "due_soon", status: "in_progress", source_type: "task" }, memberPerms);
    expect(inProgress.some((a) => a.kind === "snooze")).toBe(false);
  });
});

describe("executePermissionFor", () => {
  it("маппит kind → scoped permission + dangerous", () => {
    expect(executePermissionFor("create_task_draft")).toEqual({ permission: "action_center.execute", dangerous: false });
    expect(executePermissionFor("confirm_transaction").dangerous).toBe(true);
    expect(executePermissionFor("cancel_subscription").permission).toBe("action_center.execute.subscription");
    expect(executePermissionFor("delete_task")).toEqual({ permission: "data.delete", dangerous: true });
    expect(executePermissionFor("delete_subscription")).toEqual({ permission: "data.delete", dangerous: true });
    expect(executePermissionFor("delete_planner_entry")).toEqual({ permission: "planner.entry.delete", dangerous: true });
  });
});
