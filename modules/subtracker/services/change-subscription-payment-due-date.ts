import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { calculateNextPaymentDate, previousDay } from "./calculate-next-payment-date";
import {
  PAYMENT_CYCLE_COLUMNS,
  SUBSCRIPTION_FOR_PAYMENT_COLUMNS,
  type SubscriptionForPayment,
  type SubscriptionPaymentCycle,
} from "../types/payment-cycle.types";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Move the due date of an open payment cycle. Audited business action:
 * updates the cycle bounds, the payment task's due date, and re-anchors the
 * subscription so future periods follow the new day. Creates no transaction.
 */
export async function changeSubscriptionPaymentDueDate(params: {
  supabase: SupabaseClient;
  ctx: CurrentContext;
  cycleId: string;
  newDueDate: string;
}): Promise<Result> {
  const { supabase, ctx, cycleId, newDueDate } = params;

  const { data: cycleRow } = await supabase
    .from("subscription_payment_cycles")
    .select(PAYMENT_CYCLE_COLUMNS)
    .eq("id", cycleId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!cycleRow) return { ok: false, error: "Payment cycle not found" };
  const cycle = cycleRow as SubscriptionPaymentCycle;

  if (cycle.status !== "planned" && cycle.status !== "task_open") {
    return { ok: false, error: "Only an open payment cycle's due date can be changed" };
  }
  if (newDueDate === cycle.due_date) return { ok: true };

  const { data: subRow } = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_FOR_PAYMENT_COLUMNS)
    .eq("id", cycle.subscription_id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!subRow) return { ok: false, error: "Subscription not found" };
  const subscription = subRow as SubscriptionForPayment;

  const newAnchor = Number(newDueDate.slice(8, 10));
  const nextAfter = calculateNextPaymentDate(newDueDate, subscription.billing_cycle, newAnchor);

  // billing_period_key is a stable identity label — kept as-is to avoid unique
  // collisions; only the schedule bounds move.
  const { data: updated, error: updateError } = await supabase
    .from("subscription_payment_cycles")
    .update({
      due_date: newDueDate,
      period_start: newDueDate,
      period_end: previousDay(nextAfter),
    })
    .eq("id", cycle.id)
    .eq("organization_id", ctx.org.id)
    .in("status", ["planned", "task_open"])
    .select("id")
    .maybeSingle();
  if (updateError || !updated) {
    console.error("[changeSubscriptionPaymentDueDate] cycle update failed:", updateError?.message);
    return { ok: false, error: "Failed to change due date" };
  }

  if (cycle.task_id) {
    await supabase
      .from("todos")
      .update({ due_date: newDueDate, updated_by: ctx.user.id })
      .eq("id", cycle.task_id)
      .eq("organization_id", ctx.org.id)
      .is("deleted_at", null);
  }

  // Re-anchor the subscription so subsequent periods follow the new day.
  await supabase
    .from("subscriptions")
    .update({
      next_billing_date: newDueDate,
      billing_anchor_day: Number.isFinite(newAnchor) ? newAnchor : subscription.billing_anchor_day,
      updated_by: ctx.user.id,
    })
    .eq("id", subscription.id)
    .eq("organization_id", ctx.org.id);

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: cycle.workspace_id ?? undefined,
    eventName: "subscription.payment_due_date.changed",
    aggregateType: "subscription_payment_cycle",
    aggregateId: cycle.id,
    payload: {
      subscription_id: subscription.id,
      cycle_id: cycle.id,
      old_due_date: cycle.due_date,
      new_due_date: newDueDate,
    },
  });
  await emitAuditLog({
    organizationId: ctx.org.id,
    entityType: "subscription_payment_cycles",
    entityId: cycle.id,
    action: "update",
    oldData: { due_date: cycle.due_date },
    newData: { due_date: newDueDate },
    metadata: { source: "dashboard", trigger: "change_due_date" },
  });

  return { ok: true };
}
