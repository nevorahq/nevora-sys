import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Whether a posted transaction is the settlement record of a paid cycle. */
export async function hasPaidSubscriptionCycleForTransaction(params: {
  supabase: SupabaseClient;
  organizationId: string;
  transactionId: string;
}): Promise<boolean> {
  const { data } = await params.supabase
    .from("subscription_payment_cycles")
    .select("id")
    .eq("transaction_id", params.transactionId)
    .eq("status", "paid")
    .eq("organization_id", params.organizationId)
    .limit(1)
    .maybeSingle();

  return Boolean(data);
}
