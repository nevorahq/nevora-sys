import { createClient } from "@/lib/supabase/server";
import type { SubscriptionWithPlan } from "../types/billing.types";

export async function getSubscription(
  organizationId: string,
): Promise<SubscriptionWithPlan | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("billing_subscriptions")
    .select(
      "id, organization_id, plan_id, status, billing_cycle, " +
      "trial_ends_at, current_period_start, current_period_end, " +
      "canceled_at, cancel_at_period_end, external_id, metadata, created_at, updated_at, " +
      "plan:plans!plan_id(" +
        "id, slug, name, description, price_monthly, price_yearly, currency, is_active, " +
        "max_members, max_workspaces, max_tasks, max_deals, max_clients, " +
        "max_documents, max_subscriptions, max_money_transactions, max_ai_calls_mo, max_storage_mb, " +
        "included_members, extra_member_price, features, created_at, updated_at" +
      ")",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("getSubscription error:", error);
    return null;
  }
  return data as unknown as SubscriptionWithPlan | null;
}
