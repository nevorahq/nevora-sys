import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { retireGeneratedTasks } from "@/platform/task-lifecycle/server";
import { calculateNextPaymentDate } from "./calculate-next-payment-date";
import { provisionSubscriptionPaymentCycle } from "./provision-subscription-payment-cycle";
import {
  PAYMENT_CYCLE_COLUMNS,
  SUBSCRIPTION_FOR_PAYMENT_COLUMNS,
  type SubscriptionForPayment,
  type SubscriptionPaymentCycle,
} from "../types/payment-cycle.types";

type Result = { ok: true; nextCycleId: string | null } | { ok: false; error: string };

/**
 * Mark the current billing period paid. Subscriptions owns this fact locally —
 * it does NOT post a Money transaction or touch any Money table. Products do
 * not know about each other; a user who wants the payment reflected in their
 * financial picture records it in Money themselves.
 */
export async function markSubscriptionPaymentAsPaid(params: {
  supabase: SupabaseClient;
  ctx: CurrentContext;
  cycleId: string;
  paidDate?: string;
}): Promise<Result> {
  const { supabase, ctx, cycleId, paidDate } = params;

  const { data: cycleRow } = await supabase
    .from("subscription_payment_cycles")
    .select(PAYMENT_CYCLE_COLUMNS)
    .eq("id", cycleId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!cycleRow) return { ok: false, error: "Payment cycle not found" };
  const cycle = cycleRow as SubscriptionPaymentCycle;

  if (cycle.status === "paid") return { ok: true, nextCycleId: null };
  if (cycle.status !== "planned" && cycle.status !== "task_open") {
    return { ok: false, error: "This payment cycle can no longer be marked as paid" };
  }

  const paidAt = paidDate ? `${paidDate}T00:00:00.000Z` : new Date().toISOString();

  // Idempotency: only flip from an open state (guards a concurrent pay/skip).
  const { data: paid, error: paidError } = await supabase
    .from("subscription_payment_cycles")
    .update({ status: "paid", paid_at: paidAt })
    .eq("id", cycle.id)
    .eq("organization_id", ctx.org.id)
    .in("status", ["planned", "task_open"])
    .select("id")
    .maybeSingle();
  if (paidError || !paid) {
    console.error("[markSubscriptionPaymentAsPaid] update failed:", paidError?.message);
    return { ok: false, error: "Failed to mark payment cycle as paid" };
  }

  if (cycle.task_id) {
    await retireGeneratedTasks({
      supabase,
      ctx,
      taskIds: [cycle.task_id],
    });
  }

  const { data: subRow } = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_FOR_PAYMENT_COLUMNS)
    .eq("id", cycle.subscription_id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: cycle.workspace_id ?? undefined,
    eventName: "subscription.payment_cycle.paid",
    aggregateType: "subscription_payment_cycle",
    aggregateId: cycle.id,
    payload: {
      subscription_id: cycle.subscription_id,
      cycle_id: cycle.id,
      billing_period_key: cycle.billing_period_key,
      paid_at: paidAt,
    },
  });
  await emitAuditLog({
    organizationId: ctx.org.id,
    entityType: "subscription_payment_cycles",
    entityId: cycle.id,
    action: "update",
    oldData: { status: cycle.status },
    newData: { status: "paid" },
    metadata: { source: "dashboard", trigger: "mark_as_paid" },
  });

  let nextCycleId: string | null = null;
  if (subRow) {
    const subscription = subRow as SubscriptionForPayment;
    await supabase
      .from("subscriptions")
      .update({ last_payment_date: paidAt.slice(0, 10), updated_by: ctx.user.id })
      .eq("id", subscription.id)
      .eq("organization_id", ctx.org.id);

    if (subscription.is_active && !subscription.cancelled_at && subscription.auto_task_enabled) {
      const nextDue = calculateNextPaymentDate(cycle.due_date, subscription.billing_cycle, subscription.billing_anchor_day);
      await supabase
        .from("subscriptions")
        .update({ next_billing_date: nextDue, updated_by: ctx.user.id })
        .eq("id", subscription.id)
        .eq("organization_id", ctx.org.id);

      const provisioned = await provisionSubscriptionPaymentCycle({
        supabase,
        ctx,
        subscription: { ...subscription, next_billing_date: nextDue },
        dueDate: nextDue,
      });
      if (provisioned.ok) nextCycleId = provisioned.cycle.id;
    }
  }

  return { ok: true, nextCycleId };
}
