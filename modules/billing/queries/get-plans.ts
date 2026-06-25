import { createClient } from "@/lib/supabase/server";
import type { Plan } from "../types/billing.types";

export async function getPlans(): Promise<Plan[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("plans")
    .select(
      "id, slug, name, description, price_monthly, price_yearly, currency, is_active, " +
      "max_members, max_workspaces, max_tasks, max_deals, max_clients, " +
      "max_documents, max_subscriptions, max_money_transactions, " +
      "max_ai_calls_mo, max_storage_mb, included_members, extra_member_price, features, created_at, updated_at",
    )
    .eq("is_active", true)
    .order("price_monthly", { ascending: true });

  if (error) {
    console.error("getPlans error:", error);
    return [];
  }
  return (data ?? []) as unknown as Plan[];
}
