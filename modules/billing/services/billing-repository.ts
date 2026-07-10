import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { BillingProvider } from "./billing-provider";

export const billingRepository = {
  async getProviderCustomerId(
    organizationId: string,
    provider: BillingProvider,
  ): Promise<string | null> {
    const supabase = await createClient();

    const { data: subscription } = await supabase
      .from("billing_subscriptions")
      .select("provider_customer_id")
      .eq("organization_id", organizationId)
      .maybeSingle();

    const subscriptionCustomerId = (subscription as { provider_customer_id?: string | null } | null)
      ?.provider_customer_id;
    if (subscriptionCustomerId) return subscriptionCustomerId;

    const { data: mapping } = await supabase
      .from("billing_provider_mappings")
      .select("provider_customer_id")
      .eq("organization_id", organizationId)
      .eq("provider", provider)
      .eq("is_active", true)
      .not("provider_customer_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return (mapping as { provider_customer_id?: string | null } | null)?.provider_customer_id ?? null;
  },

  /**
   * The organization's provider subscription id, if one is on file. Used to
   * scope a customer-portal session to this org's subscription (cancel / update
   * payment deep links). Absence is fine — the portal still opens on overview.
   */
  async getProviderSubscriptionId(organizationId: string): Promise<string | null> {
    const supabase = await createClient();

    const { data } = await supabase
      .from("billing_subscriptions")
      .select("provider_subscription_id")
      .eq("organization_id", organizationId)
      .not("provider_subscription_id", "is", null)
      .maybeSingle();

    return (data as { provider_subscription_id?: string | null } | null)?.provider_subscription_id ?? null;
  },
};
