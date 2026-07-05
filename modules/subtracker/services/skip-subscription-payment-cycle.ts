import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
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
 * Skip the current billing period without paying. Creates NO money transaction.
 * The open task is soft-deleted (todos has no 'cancelled' state), the cycle is
 * marked `skipped`, and the schedule advances so the subscription keeps going.
 */
export async function skipSubscriptionPaymentCycle(params: {
  supabase: SupabaseClient;
  ctx: CurrentContext;
  cycleId: string;
}): Promise<Result> {
  const { supabase, ctx, cycleId } = params;

  const { data: cycleRow } = await supabase
    .from("subscription_payment_cycles")
    .select(PAYMENT_CYCLE_COLUMNS)
    .eq("id", cycleId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!cycleRow) return { ok: false, error: "Payment cycle not found" };
  const cycle = cycleRow as SubscriptionPaymentCycle;

  if (cycle.status !== "planned" && cycle.status !== "task_open") {
    return { ok: false, error: "This payment cycle can no longer be skipped" };
  }

  // Mark skipped only from an open state (guards against a concurrent pay/skip).
  const { data: skipped, error: skipError } = await supabase
    .from("subscription_payment_cycles")
    .update({ status: "skipped", skipped_at: new Date().toISOString() })
    .eq("id", cycle.id)
    .eq("organization_id", ctx.org.id)
    .in("status", ["planned", "task_open"])
    .select("id")
    .maybeSingle();
  if (skipError || !skipped) {
    console.error("[skipSubscriptionPaymentCycle] skip failed:", skipError?.message);
    return { ok: false, error: "Failed to skip payment cycle" };
  }

  // Retire the open payment task (soft delete keeps history, drops it from
  // active lists).
  if (cycle.task_id) {
    await supabase
      .from("todos")
      .update({ deleted_at: new Date().toISOString(), updated_by: ctx.user.id })
      .eq("id", cycle.task_id)
      .eq("organization_id", ctx.org.id)
      .is("deleted_at", null);
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
    eventName: "subscription.payment_cycle.skipped",
    aggregateType: "subscription_payment_cycle",
    aggregateId: cycle.id,
    payload: {
      subscription_id: cycle.subscription_id,
      cycle_id: cycle.id,
      billing_period_key: cycle.billing_period_key,
    },
  });
  await emitAuditLog({
    organizationId: ctx.org.id,
    entityType: "subscription_payment_cycles",
    entityId: cycle.id,
    action: "update",
    oldData: { status: cycle.status },
    newData: { status: "skipped" },
    metadata: { source: "dashboard", trigger: "skip_cycle" },
  });

  // Advance the schedule + open the next cycle, unless the subscription is done.
  let nextCycleId: string | null = null;
  if (subRow) {
    const subscription = subRow as SubscriptionForPayment;
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
