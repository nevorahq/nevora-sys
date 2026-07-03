import { describe, expect, it } from "vitest";
import { REMINDER_POLICY, reminderIdempotencyKey, taskReminderPolicy } from "./reminder-policy";

describe("reminder policy", () => {
  it("uses the MVP task milestones and adds 7d/3d overdue for high priority", () => {
    expect(taskReminderPolicy("medium").map((item) => item.offset)).toEqual([-3, -1, 0, 1]);
    expect(taskReminderPolicy("high").map((item) => item.offset)).toEqual([-7, -3, -1, 0, 1, 3]);
  });

  it("keeps financial and review policies centralized", () => {
    expect(REMINDER_POLICY.subscription.map((item) => item.offset)).toEqual([-7, -3, -1, 0, 1, 3]);
    expect(REMINDER_POLICY.payment.map((item) => item.offset)).toEqual([-3, -1, 0, 1]);
    expect(REMINDER_POLICY.document.map((item) => item.offset)).toEqual([0, 24, 72]);
  });

  it("includes recipient, milestone, and source date in stable keys", () => {
    expect(reminderIdempotencyKey({ sourceType: "task", sourceId: "task-a", recipientUserId: "user-a", trigger: "due-minus-3d", sourceDate: "2026-07-10" }))
      .toBe("task:task-a:user-a:due-minus-3d:2026-07-10");
  });
});
