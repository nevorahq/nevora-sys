import type { PaymentCycleStatus } from "../constants/payment-cycle.constants";

/** subscription_payment_cycles row (migration 078). */
export type SubscriptionPaymentCycle = {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  subscription_id: string;
  period_start: string;
  period_end: string;
  due_date: string;
  billing_period_key: string;
  expected_amount: number;
  currency: string;
  status: PaymentCycleStatus;
  task_id: string | null;
  transaction_id: string | null;
  document_id: string | null;
  idempotency_key: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  skipped_at: string | null;
  cancelled_at: string | null;
};

/** Explicit column list — no select("*"). */
export const PAYMENT_CYCLE_COLUMNS =
  "id, organization_id, workspace_id, subscription_id, period_start, period_end, due_date, billing_period_key, expected_amount, currency, status, task_id, transaction_id, document_id, idempotency_key, created_by, created_at, updated_at, paid_at, skipped_at, cancelled_at" as const;

/** Subscription fields the payment workflow needs. */
export type SubscriptionForPayment = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  billing_cycle: "weekly" | "monthly" | "yearly";
  billing_anchor_day: number | null;
  next_billing_date: string;
  default_category_id: string | null;
  auto_task_enabled: boolean;
  is_active: boolean;
  cancelled_at: string | null;
  workspace_id: string | null;
};

export const SUBSCRIPTION_FOR_PAYMENT_COLUMNS =
  "id, name, amount, currency, billing_cycle, billing_anchor_day, next_billing_date, default_category_id, auto_task_enabled, is_active, cancelled_at, workspace_id" as const;
