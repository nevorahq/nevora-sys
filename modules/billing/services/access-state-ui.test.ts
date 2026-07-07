import { describe, expect, it } from "vitest";
import {
  AI_BLOCKED_MESSAGE,
  DEFAULT_BLOCKED_ACTION_MESSAGE,
  INVITE_BLOCKED_MESSAGE,
  blockedActionMessage,
  getAccessStateView,
  isAccessIntentAllowed,
} from "./access-state-ui";

describe("access-state UI helpers", () => {
  it("allows trialing writes and hides warnings", () => {
    const view = getAccessStateView("trialing");
    expect(view.canWrite).toBe(true);
    expect(view.canInvite).toBe(true);
    expect(view.canExecute).toBe(true);
    expect(view.shouldWarn).toBe(false);
  });

  it("renders expired trial as read-only with required microcopy", () => {
    const view = getAccessStateView("trial_expired");
    expect(view.canWrite).toBe(false);
    expect(view.isReadOnly).toBe(true);
    expect(view.banner).toBe("Пробный период завершён. Данные сохранены, но новые действия временно недоступны. Выберите платный план, чтобы продолжить.");
    expect(isAccessIntentAllowed("trial_expired", "write")).toBe(false);
  });

  it("does not show false warnings for developer unlimited", () => {
    const view = getAccessStateView("developer_unlimited");
    expect(view.canWrite).toBe(true);
    expect(view.canInvite).toBe(true);
    expect(view.canExecute).toBe(true);
    expect(view.shouldWarn).toBe(false);
  });

  it("uses specialized blocked copy by intent", () => {
    expect(blockedActionMessage("invite", "trial_expired")).toBe(INVITE_BLOCKED_MESSAGE);
    expect(blockedActionMessage("execute", "payment_unpaid")).toBe(AI_BLOCKED_MESSAGE);
    expect(blockedActionMessage("write", "paid_active")).toBe(DEFAULT_BLOCKED_ACTION_MESSAGE);
  });
});
