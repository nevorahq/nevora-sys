import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { createEntityLink } from "@/lib/entity-links";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { calculateNextPaymentDate, previousDay } from "./calculate-next-payment-date";
import { createBillingPeriodKey } from "./billing-period-key";
import { createSubscriptionPaymentTaskForCycle } from "./create-subscription-payment-task";
import {
  buildSubscriptionExpenseIdempotencyKey,
  buildSubscriptionExpenseTitle,
} from "./subscription-payment-keys";
import {
  PAYMENT_CYCLE_COLUMNS,
  SUBSCRIPTION_FOR_PAYMENT_COLUMNS,
  type SubscriptionForPayment,
  type SubscriptionPaymentCycle,
} from "../types/payment-cycle.types";

type Result =
  | { ok: true; transactionId: string | null; alreadyPaid: boolean; nextCycleId: string | null }
  | { ok: false; error: string };

type RpcResult = {
  already_paid: boolean;
  cycle_id: string;
  transaction_id: string | null;
  task_id: string | null;
  next_cycle_id: string | null;
  next_due_date?: string;
  workspace_id?: string | null;
  subscription_id?: string;
};

/**
 * Mark a subscription's current payment cycle as paid.
 *
 * The money-critical steps (create expense, mark cycle paid, complete task,
 * advance subscription, create next planned cycle) run atomically inside the
 * `mark_subscription_payment_paid` RPC. This wrapper resolves the cycle +
 * subscription, computes the next schedule (single TS source of truth), then
 * performs best-effort side effects: links, the next payment task, events and
 * audit logs.
 *
 * Idempotent: a cycle already paid returns its existing transaction and creates
 * nothing new — a duplicate click can never create a duplicate expense.
 */
export async function markSubscriptionPaymentAsPaid(params: {
  supabase: SupabaseClient;
  ctx: CurrentContext;
  cycleId: string;
  accountId: string;
  paidDate?: string;
}): Promise<Result> {
  const { supabase, ctx, cycleId, accountId, paidDate } = params;

  // Load cycle (scoped to org by RLS) to resolve the subscription + schedule.
  const { data: cycleRow } = await supabase
    .from("subscription_payment_cycles")
    .select(PAYMENT_CYCLE_COLUMNS)
    .eq("id", cycleId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!cycleRow) return { ok: false, error: "Payment cycle not found" };
  const cycle = cycleRow as SubscriptionPaymentCycle;

  const { data: subRow } = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_FOR_PAYMENT_COLUMNS)
    .eq("id", cycle.subscription_id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!subRow) return { ok: false, error: "Subscription not found" };
  const subscription = subRow as SubscriptionForPayment;

  // Next schedule — anchor-preserving, computed from the cycle's own due date so
  // paying late never shifts the future schedule.
  const nextDue = calculateNextPaymentDate(cycle.due_date, subscription.billing_cycle, subscription.billing_anchor_day);
  const nextPeriodKey = createBillingPeriodKey(nextDue, subscription.billing_cycle);
  const nextAfter = calculateNextPaymentDate(nextDue, subscription.billing_cycle, subscription.billing_anchor_day);
  const transactionTitle = buildSubscriptionExpenseTitle(subscription.name, cycle.billing_period_key);

  const { data, error } = await supabase.rpc("mark_subscription_payment_paid", {
    p_organization_id: ctx.org.id,
    p_cycle_id: cycleId,
    p_account_id: accountId,
    p_paid_date: paidDate ?? null,
    p_transaction_title: transactionTitle,
    p_next_billing_period_key: nextPeriodKey,
    p_next_period_start: nextDue,
    p_next_period_end: previousDay(nextAfter),
    p_next_due_date: nextDue,
  });

  if (error) {
    console.error("[markSubscriptionPaymentAsPaid] rpc failed:", error.message);
    return { ok: false, error: mapRpcError(error.message) };
  }

  const rpc = data as RpcResult;

  // Idempotent short-circuit: nothing new was written.
  if (rpc.already_paid) {
    return { ok: true, transactionId: rpc.transaction_id, alreadyPaid: true, nextCycleId: null };
  }

  const workspaceId = (rpc.workspace_id ?? cycle.workspace_id) ?? undefined;
  const paidAt = new Date().toISOString();

  // ── Best-effort side effects (never roll back a posted payment) ──────────
  if (rpc.transaction_id) {
    // transaction --paid_by--> subscription is created by the on-transaction-created
    // automation from this event; we add transaction --generated_from--> task.
    await emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId,
      eventName: "money.transaction.created",
      aggregateType: "transaction",
      aggregateId: rpc.transaction_id,
      payload: {
        amount: cycle.expected_amount,
        type: "expense",
        currency: cycle.currency,
        status: "posted",
        transaction_date: (paidDate ?? paidAt.slice(0, 10)),
        subscription_id: subscription.id,
      },
    });

    if (rpc.task_id) {
      await createEntityLink({
        sourceType: "transaction",
        sourceId: rpc.transaction_id,
        targetType: "task",
        targetId: rpc.task_id,
        linkType: "generated_from",
        relationDirection: "derived",
        metadata: { source: "auto", matched_by: ["subscription_payment_cycle"], cycle_id: cycle.id },
      });
    }

    await emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId,
      eventName: "subscription.payment_cycle.paid",
      aggregateType: "subscription_payment_cycle",
      aggregateId: cycle.id,
      payload: {
        subscription_id: subscription.id,
        cycle_id: cycle.id,
        billing_period_key: cycle.billing_period_key,
        transaction_id: rpc.transaction_id,
        amount: cycle.expected_amount,
        currency: cycle.currency,
        paid_at: paidAt,
      },
    });

    await emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "subscription_payment_cycles",
      entityId: cycle.id,
      action: "update",
      oldData: { status: cycle.status },
      newData: { status: "paid", transaction_id: rpc.transaction_id },
      metadata: {
        source: "dashboard",
        trigger: "mark_as_paid",
        expense_idempotency_key: buildSubscriptionExpenseIdempotencyKey(subscription.id, cycle.id),
      },
    });
  }

  if (rpc.task_id) {
    await emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId,
      eventName: "task.completed",
      aggregateType: "task",
      aggregateId: rpc.task_id,
      payload: { title: transactionTitle, completed_at: paidAt },
    });
  }

  // Next planned cycle gets its payment task (best-effort; cron repairs misses).
  if (rpc.next_cycle_id) {
    const { data: nextCycleRow } = await supabase
      .from("subscription_payment_cycles")
      .select(PAYMENT_CYCLE_COLUMNS)
      .eq("id", rpc.next_cycle_id)
      .eq("organization_id", ctx.org.id)
      .maybeSingle();
    if (nextCycleRow) {
      await createSubscriptionPaymentTaskForCycle({
        supabase,
        ctx,
        subscription,
        cycle: nextCycleRow as SubscriptionPaymentCycle,
      });
    }
  }

  return { ok: true, transactionId: rpc.transaction_id, alreadyPaid: false, nextCycleId: rpc.next_cycle_id };
}

function mapRpcError(message: string): string {
  if (message.includes("cycle_not_found")) return "Payment cycle not found";
  if (message.includes("cycle_not_payable")) return "This payment cycle can no longer be paid";
  if (message.includes("account_not_found")) return "Selected account was not found";
  if (message.includes("subscription_not_found")) return "Subscription not found";
  if (message.includes("not_authorized")) return "You do not have permission to record this payment";
  return "Failed to record payment";
}
