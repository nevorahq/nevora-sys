import type { BillingCycle } from "./subscription-constants";
import type { RenewalAttentionState, SubscriptionRenewalCase } from "./renewal-types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function defaultRenewalReminderDays(cycle: BillingCycle): number {
  return cycle === "yearly" ? 30 : 7;
}

export function addDaysISO(date: string, days: number): string {
  if (!ISO_DATE.test(date)) throw new Error("Invalid ISO date");
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function renewalDecisionDueDate(renewalDate: string, reminderDays: number): string {
  if (!Number.isInteger(reminderDays) || reminderDays < 1 || reminderDays > 180) {
    throw new Error("Reminder days must be between 1 and 180");
  }
  return addDaysISO(renewalDate, -reminderDays);
}

export function daysBetweenISO(from: string, to: string): number {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) return 0;
  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  return Math.round((toMs - fromMs) / 86_400_000);
}

export function deriveRenewalAttentionState(
  renewalCase: Pick<SubscriptionRenewalCase, "status" | "decision_due_date" | "snoozed_until">,
  today: string,
  now = new Date(),
): RenewalAttentionState {
  if (renewalCase.status === "keep") return "resolved_keep";
  if (renewalCase.status === "wont_renew") return "resolved_wont_renew";
  if (renewalCase.snoozed_until && Date.parse(renewalCase.snoozed_until) > now.getTime()) return "snoozed";
  if (renewalCase.status === "reviewing") return "reviewing";
  if (renewalCase.decision_due_date > today) return "future";
  if (renewalCase.decision_due_date < today) return "overdue";
  return "needs_decision";
}
