import "server-only";

import { createClient } from "@/lib/supabase/server";
import { buildAccountLimits } from "./account-limits";
import type { AccountAccessProfile, AccountLimits } from "./account-limits";
import type { Plan } from "@/modules/billing";

/**
 * Resolves product quotas for one account in one organization.
 * `null` means unlimited. Infrastructure and security limits are deliberately
 * outside this resolver and therefore can never be bypassed by this flag.
 */
export async function resolveAccountLimits(
  userId: string,
  organizationId: string,
): Promise<AccountLimits> {
  const supabase = await createClient();

  const [profileResult, subscriptionResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("account_role, unlimited_access")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("billing_subscriptions")
      .select(
        "plan:plans!plan_id(" +
          "max_workspaces, max_members, max_tasks, max_clients, max_deals, " +
          "max_documents, max_subscriptions, max_money_transactions, " +
          "max_storage_mb, max_ai_calls_mo" +
        ")",
      )
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  // Fail closed for the override: an unreadable/missing profile is a normal
  // user. A missing legacy subscription retains the pre-existing no-limit
  // behavior so this migration cannot lock old organizations.
  const profile = profileResult.data as AccountAccessProfile | null;
  const subscription = subscriptionResult.data as unknown as {
    plan: Plan | Plan[] | null;
  } | null;
  const rawPlan = subscription?.plan;
  const plan = (Array.isArray(rawPlan) ? rawPlan[0] : rawPlan) as Plan | null;

  return buildAccountLimits(profile, plan);
}
