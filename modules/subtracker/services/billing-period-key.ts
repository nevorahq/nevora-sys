import type { BillingCycle } from "../constants/subtracker.constants";

/**
 * Stable, human-readable key identifying one billing period of a subscription.
 * Unique per subscription (DB: unique(org, subscription, billing_period_key)).
 *
 *   monthly -> YYYY-MM      (2026-07)
 *   yearly  -> YYYY         (2026)
 *   weekly  -> YYYY-MM-DD   (2026-07-15) — the due date itself, so distinct
 *                            weekly periods never collide within a month.
 *
 * `dueDate` must be an ISO date (YYYY-MM-DD).
 */
export function createBillingPeriodKey(dueDate: string, cycle: BillingCycle): string {
  const [year, month] = dueDate.split("-");
  if (cycle === "yearly") return year;
  if (cycle === "weekly") return dueDate;
  return `${year}-${month}`;
}
