import type { SupabaseClient } from "@supabase/supabase-js";

// Active relation scope only: Tasks, Money, Documents, Subscriptions. CRM /
// Leads / Clients / Deals are paused and must not be added here until explicitly
// reactivated by product decision. Any type outside this map fails closed below.
const ENTITY_TABLES: Record<string, string> = {
  task: "todos",
  document: "documents",
  transaction: "money_transactions",
  subscription: "subscriptions",
};

/** Verifies both ends of a polymorphic link exist inside the active tenant. */
export async function verifyEntityOrganization(
  supabase: SupabaseClient,
  organizationId: string,
  type: string,
  id: string,
): Promise<boolean> {
  const table = ENTITY_TABLES[type];
  if (!table) return false;

  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return !error && data !== null;
}
