import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { createBillingPeriodKey } from "./billing-period-key";
import { calculateNextPaymentDate, previousDay } from "./calculate-next-payment-date";
import { buildCycleIdempotencyKey } from "./subscription-payment-keys";
import {
  PAYMENT_CYCLE_COLUMNS,
  type SubscriptionForPayment,
  type SubscriptionPaymentCycle,
} from "../types/payment-cycle.types";

type Result =
  | { ok: true; cycle: SubscriptionPaymentCycle; created: boolean }
  | { ok: false; error: string };

/**
 * Insert a `planned` payment cycle for a subscription's given due date.
 *
 * Idempotent: a duplicate billing period (or an already-open cycle) resolves to
 * the existing row instead of failing, so retries and the safety-repair cron
 * never create duplicates. Creating a cycle NEVER creates a money transaction.
 */
export async function createSubscriptionPaymentCycle(params: {
  supabase: SupabaseClient;
  ctx: CurrentContext;
  subscription: SubscriptionForPayment;
  dueDate: string;
}): Promise<Result> {
  const { supabase, ctx, subscription, dueDate } = params;

  const billingPeriodKey = createBillingPeriodKey(dueDate, subscription.billing_cycle);
  const nextDue = calculateNextPaymentDate(dueDate, subscription.billing_cycle, subscription.billing_anchor_day);
  const idempotencyKey = buildCycleIdempotencyKey(subscription.id, billingPeriodKey);

  const { data, error } = await supabase
    .from("subscription_payment_cycles")
    .insert({
      organization_id: ctx.org.id,
      workspace_id: subscription.workspace_id ?? ctx.workspace.id,
      subscription_id: subscription.id,
      period_start: dueDate,
      period_end: previousDay(nextDue),
      due_date: dueDate,
      billing_period_key: billingPeriodKey,
      expected_amount: subscription.amount,
      currency: subscription.currency,
      status: "planned",
      idempotency_key: idempotencyKey,
      created_by: ctx.user.id,
    })
    .select(PAYMENT_CYCLE_COLUMNS)
    .single();

  if (error) {
    // 23505 — either this period already exists, or another open cycle blocks a
    // second one. Resolve to the existing open/period cycle (idempotent).
    if (error.code === "23505") {
      const existing = await findReusableCycle(supabase, ctx.org.id, subscription.id, billingPeriodKey);
      if (existing) return { ok: true, cycle: existing, created: false };
    }
    console.error("[createSubscriptionPaymentCycle] insert failed:", error.message);
    return { ok: false, error: "Failed to create payment cycle" };
  }

  const cycle = data as SubscriptionPaymentCycle;

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: cycle.workspace_id ?? undefined,
    eventName: "subscription.payment_cycle.created",
    aggregateType: "subscription_payment_cycle",
    aggregateId: cycle.id,
    payload: {
      subscription_id: subscription.id,
      cycle_id: cycle.id,
      billing_period_key: billingPeriodKey,
      due_date: dueDate,
      expected_amount: subscription.amount,
      currency: subscription.currency,
    },
  });
  await emitAuditLog({
    organizationId: ctx.org.id,
    entityType: "subscription_payment_cycles",
    entityId: cycle.id,
    action: "create",
    newData: { subscription_id: subscription.id, billing_period_key: billingPeriodKey, due_date: dueDate },
    metadata: { source: "dashboard" },
  });

  return { ok: true, cycle, created: true };
}

async function findReusableCycle(
  supabase: SupabaseClient,
  organizationId: string,
  subscriptionId: string,
  billingPeriodKey: string,
): Promise<SubscriptionPaymentCycle | null> {
  const { data: byKey } = await supabase
    .from("subscription_payment_cycles")
    .select(PAYMENT_CYCLE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("subscription_id", subscriptionId)
    .eq("billing_period_key", billingPeriodKey)
    .maybeSingle();
  if (byKey) return byKey as SubscriptionPaymentCycle;

  const { data: open } = await supabase
    .from("subscription_payment_cycles")
    .select(PAYMENT_CYCLE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("subscription_id", subscriptionId)
    .in("status", ["planned", "task_open"])
    .order("due_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (open as SubscriptionPaymentCycle | null) ?? null;
}
