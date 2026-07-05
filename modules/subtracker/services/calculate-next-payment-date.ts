import type { BillingCycle } from "../constants/subtracker.constants";

/**
 * Next payment date for a subscription cycle.
 *
 * Unlike {@link calculateNextBillingDate} (which derives the day-of-month from
 * the input date), this preserves an explicit billing ANCHOR day so the
 * schedule never drifts. A subscription due on the 31st stays on the 31st,
 * clamped to the last day of shorter months.
 *
 *   from 2026-07-15, monthly, anchor 15 -> 2026-08-15
 *   from 2026-01-31, monthly, anchor 31 -> 2026-02-28 -> next -> 2026-03-31
 *
 * The completion date is intentionally NOT an input: paying late does not push
 * the next due date forward.
 */
export function calculateNextPaymentDate(
  fromDate: string,
  cycle: BillingCycle,
  anchorDay?: number | null,
): string {
  const [year, month, day] = fromDate.split("-").map(Number);

  if (cycle === "weekly") {
    const result = new Date(Date.UTC(year, month - 1, day + 7));
    return result.toISOString().slice(0, 10);
  }

  const monthsToAdd = cycle === "monthly" ? 1 : 12;
  const anchor =
    typeof anchorDay === "number" && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : day;

  const targetMonthIndex = month - 1 + monthsToAdd;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

  return new Date(Date.UTC(targetYear, targetMonth, Math.min(anchor, lastDay)))
    .toISOString()
    .slice(0, 10);
}

/**
 * The date one day before `date` — used to close a period_end so periods are
 * contiguous but non-overlapping ([period_start, next_due - 1 day]).
 */
export function previousDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}
