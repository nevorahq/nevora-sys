import { describe, it, expect } from "vitest";
import { getAvailableActions, executePermissionFor } from "./action-visibility-service";

const memberPerms = new Set(["action_center.view", "action_center.resolve", "action_center.dismiss", "action_center.execute"]);
const adminPerms = new Set([
  ...memberPerms,
  "action_center.assign",
  "action_center.execute.financial",
  "action_center.execute.subscription",
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
  });
});
