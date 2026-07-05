/**
 * Deterministic keys + titles for the subscription payment workflow.
 * Pure string builders — trivially unit-testable and shared by services, the
 * DB RPC contract and tests.
 */

/**
 * Cycle idempotency envelope. Matches the value written by
 * mark_subscription_payment_paid() for the next cycle, so the first cycle
 * (created from TypeScript) and subsequent cycles (created in the RPC) share
 * one format and the same unique(org, idempotency_key) guard.
 */
export function buildCycleIdempotencyKey(subscriptionId: string, billingPeriodKey: string): string {
  return `subscription:${subscriptionId}:cycle:${billingPeriodKey}`;
}

/**
 * Conceptual idempotency key for the expense created on Mark-as-paid. The
 * money_transactions table has no idempotency column, so the real guard is the
 * cycle row (status + row lock + transaction_id). This key is recorded in the
 * paid event / audit metadata for traceability and future DB-level dedupe.
 */
export function buildSubscriptionExpenseIdempotencyKey(subscriptionId: string, cycleId: string): string {
  return `subscription:${subscriptionId}:cycle:${cycleId}:expense`;
}

/** Title for the per-period payment task: "Pay Figma subscription — 2026-07". */
export function buildSubscriptionPaymentTaskTitle(providerName: string, billingPeriodKey: string): string {
  const name = providerName.trim() || "subscription";
  return `Pay ${name} subscription — ${billingPeriodKey}`.slice(0, 200);
}

/** Description for the expense transaction: "Figma subscription — 2026-07". */
export function buildSubscriptionExpenseTitle(providerName: string, billingPeriodKey: string): string {
  const name = providerName.trim() || "Subscription";
  return `${name} subscription — ${billingPeriodKey}`.slice(0, 200);
}
