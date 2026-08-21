import type { SubscriptionForPayment, SubscriptionPaymentCycle } from "./payment-cycle-types";

/** Insert a `planned` payment cycle for a subscription's given due date. */
export interface CreateSubscriptionPaymentCycleInput {
  subscription: SubscriptionForPayment;
  dueDate: string;
}

export type CreateSubscriptionPaymentCycleResult =
  | { ok: true; cycle: SubscriptionPaymentCycle; created: boolean }
  | { ok: false; error: string };

/** Create the per-period payment task for a `planned` cycle and open it. */
export interface CreateSubscriptionPaymentTaskInput {
  subscription: Pick<SubscriptionForPayment, "id" | "name" | "auto_task_enabled" | "workspace_id">;
  cycle: SubscriptionPaymentCycle;
}

export type CreateSubscriptionPaymentTaskResult =
  | { ok: true; taskId: string; created: boolean }
  | { ok: false; error: string };
