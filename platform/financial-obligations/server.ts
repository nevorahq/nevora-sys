import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { getTasksApplication } from "@/platform/tasks/server";
import { hasPaidSubscriptionCycleForTransaction } from "@/modules/subtracker/server";

export type PaidObligationKind = "subscription_cycle" | "financial_task";

/**
 * Resolve whether deleting a Money transaction would un-back a paid obligation.
 * The adapter composes product-owned read ports without exposing their tables to
 * Money. Subscription is checked first to preserve the previous query order.
 */
export async function findPaidObligationForTransaction(params: {
  supabase: SupabaseClient;
  currentContext: CurrentContext;
  transactionId: string;
}): Promise<PaidObligationKind | null> {
  const subscriptionParams = {
    supabase: params.supabase,
    organizationId: params.currentContext.org.id,
    transactionId: params.transactionId,
  };
  if (await hasPaidSubscriptionCycleForTransaction(subscriptionParams)) {
    return "subscription_cycle";
  }
  const tasks = await getTasksApplication({
    supabase: params.supabase,
    currentContext: params.currentContext,
  });
  if (await tasks.hasPaidTaskForTransaction(params.transactionId)) {
    return "financial_task";
  }
  return null;
}
