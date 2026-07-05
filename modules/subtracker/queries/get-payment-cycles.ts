import "server-only";

import { createClient } from "@/lib/supabase/server";
import { PAYMENT_CYCLE_COLUMNS, type SubscriptionPaymentCycle } from "../types/payment-cycle.types";

/** All payment cycles for a subscription, newest period first (history + current). */
export async function getPaymentCyclesForSubscription(
  organizationId: string,
  subscriptionId: string,
): Promise<SubscriptionPaymentCycle[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_payment_cycles")
    .select(PAYMENT_CYCLE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("subscription_id", subscriptionId)
    .order("due_date", { ascending: false });

  if (error) {
    console.error("getPaymentCyclesForSubscription error:", error);
    return [];
  }
  return (data ?? []) as SubscriptionPaymentCycle[];
}

/** The single open (planned | task_open) cycle for a subscription, if any. */
export async function getOpenPaymentCycle(
  organizationId: string,
  subscriptionId: string,
): Promise<SubscriptionPaymentCycle | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_payment_cycles")
    .select(PAYMENT_CYCLE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("subscription_id", subscriptionId)
    .in("status", ["planned", "task_open"])
    .order("due_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as SubscriptionPaymentCycle | null) ?? null;
}

/** Open cycles across the org, keyed by subscription_id (for list indicators). */
export async function getOpenCyclesBySubscription(
  organizationId: string,
): Promise<Map<string, SubscriptionPaymentCycle>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_payment_cycles")
    .select(PAYMENT_CYCLE_COLUMNS)
    .eq("organization_id", organizationId)
    .in("status", ["planned", "task_open"])
    .order("due_date", { ascending: true });

  const map = new Map<string, SubscriptionPaymentCycle>();
  for (const row of (data ?? []) as SubscriptionPaymentCycle[]) {
    if (!map.has(row.subscription_id)) map.set(row.subscription_id, row);
  }
  return map;
}

/** The cycle a task belongs to, if the task is a subscription payment task. */
export async function getPaymentCycleByTaskId(
  organizationId: string,
  taskId: string,
): Promise<SubscriptionPaymentCycle | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_payment_cycles")
    .select(PAYMENT_CYCLE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("task_id", taskId)
    .maybeSingle();
  return (data as SubscriptionPaymentCycle | null) ?? null;
}

/** The cycle a transaction was created from, if any (money detail panel). */
export async function getPaymentCycleByTransactionId(
  organizationId: string,
  transactionId: string,
): Promise<SubscriptionPaymentCycle | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscription_payment_cycles")
    .select(PAYMENT_CYCLE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("transaction_id", transactionId)
    .maybeSingle();
  return (data as SubscriptionPaymentCycle | null) ?? null;
}
