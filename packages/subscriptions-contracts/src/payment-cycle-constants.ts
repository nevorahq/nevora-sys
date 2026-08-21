/**
 * Subscription Payment Workflow — domain constants (migration 078).
 */

/** Lifecycle of a single billing-period cycle. Mirrors the DB CHECK. */
export const PAYMENT_CYCLE_STATUSES = [
  "planned",
  "task_open",
  "paid",
  "skipped",
  "failed",
  "cancelled",
] as const;
export type PaymentCycleStatus = (typeof PAYMENT_CYCLE_STATUSES)[number];

/** Cycles that still expect user action (and block a second open cycle). */
export const OPEN_CYCLE_STATUSES: readonly PaymentCycleStatus[] = ["planned", "task_open"];

/** How the expense transaction is created. Mirrors subscriptions.auto_transaction_mode. */
export const AUTO_TRANSACTION_MODES = ["manual_confirm", "auto_post_on_task_complete"] as const;
export type AutoTransactionMode = (typeof AUTO_TRANSACTION_MODES)[number];
