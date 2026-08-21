import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PAYMENT_CYCLE_COLUMNS,
  type Subscription,
  type SubscriptionPaymentCycle,
} from "@nevora/subscriptions-contracts";

/** Active subscriptions for the organization, nearest renewal first. */
export async function getSubscriptions(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Subscription[]> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("next_billing_date", { ascending: true });

  if (error) {
    console.error("[subscriptions-runtime] getSubscriptions failed:", error.message);
    return [];
  }
  return data as Subscription[];
}

/** The cycle a task belongs to, if the task is a subscription payment task. */
export async function getPaymentCycleByTaskId(
  supabase: SupabaseClient,
  organizationId: string,
  taskId: string,
): Promise<SubscriptionPaymentCycle | null> {
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
  supabase: SupabaseClient,
  organizationId: string,
  transactionId: string,
): Promise<SubscriptionPaymentCycle | null> {
  const { data } = await supabase
    .from("subscription_payment_cycles")
    .select(PAYMENT_CYCLE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("transaction_id", transactionId)
    .maybeSingle();
  return (data as SubscriptionPaymentCycle | null) ?? null;
}

