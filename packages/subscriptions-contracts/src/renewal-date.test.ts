import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  defaultRenewalReminderDays,
  deriveRenewalAttentionState,
  renewalDecisionDueDate,
} from "./index";

describe("renewal decision dates", () => {
  it("uses a short default for recurring monthly/weekly decisions and 30 days for yearly", () => {
    expect(defaultRenewalReminderDays("weekly")).toBe(7);
    expect(defaultRenewalReminderDays("monthly")).toBe(7);
    expect(defaultRenewalReminderDays("yearly")).toBe(30);
  });

  it("subtracts across month and leap-year boundaries using date-only UTC math", () => {
    expect(renewalDecisionDueDate("2028-03-01", 7)).toBe("2028-02-23");
    expect(addDaysISO("2028-02-28", 2)).toBe("2028-03-01");
  });

  it("keeps snooze orthogonal to the canonical decision state", () => {
    expect(deriveRenewalAttentionState({
      status: "reviewing",
      decision_due_date: "2026-08-20",
      snoozed_until: "2026-08-24T09:00:00.000Z",
    }, "2026-08-22", new Date("2026-08-22T12:00:00.000Z"))).toBe("snoozed");

    expect(deriveRenewalAttentionState({
      status: "reviewing",
      decision_due_date: "2026-08-20",
      snoozed_until: "2026-08-21T09:00:00.000Z",
    }, "2026-08-22", new Date("2026-08-22T12:00:00.000Z"))).toBe("reviewing");
  });

  it("resolves keep and non-renewal before considering urgency", () => {
    expect(deriveRenewalAttentionState({ status: "keep", decision_due_date: "2020-01-01", snoozed_until: null }, "2026-08-22")).toBe("resolved_keep");
    expect(deriveRenewalAttentionState({ status: "wont_renew", decision_due_date: "2020-01-01", snoozed_until: null }, "2026-08-22")).toBe("resolved_wont_renew");
  });
});
