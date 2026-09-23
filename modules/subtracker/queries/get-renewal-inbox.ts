import "server-only";

import { createClient } from "@/lib/supabase/server";
import { describePgError } from "@/lib/observability/pg-error";
import {
  daysBetweenISO,
  deriveRenewalAttentionState,
  type RenewalInboxItem,
  type SubscriptionRenewalCase,
} from "@nevora/subscriptions-contracts";

export async function getRenewalInbox(organizationId: string): Promise<RenewalInboxItem[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: subscriptions, error: subscriptionError }, { data: cases, error: caseError }, { data: links }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id, name, amount, currency, billing_cycle, category, url, is_active, auto_renews, next_billing_date")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    supabase
      .from("subscription_renewal_cases")
      .select("*")
      .eq("organization_id", organizationId)
      .order("decision_due_date", { ascending: true }),
    supabase
      .from("entity_links")
      .select("source_type, source_id, target_type, target_id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .or("source_type.eq.subscription,target_type.eq.subscription"),
  ]);

  if (subscriptionError || caseError) {
    console.error("getRenewalInbox error:", describePgError(subscriptionError ?? caseError));
    return [];
  }

  const subscriptionById = new Map(
    (subscriptions ?? []).map((subscription) => [subscription.id as string, subscription]),
  );
  const subscriptionsWithDocuments = new Set<string>();
  for (const link of links ?? []) {
    const subscriptionId = link.source_type === "subscription"
      ? link.source_id as string
      : link.target_type === "subscription"
        ? link.target_id as string
        : null;
    const isDocument = link.source_type === "document" || link.target_type === "document";
    if (subscriptionId && isDocument) subscriptionsWithDocuments.add(subscriptionId);
  }

  return (cases ?? []).flatMap((row) => {
    const renewalCase = row as SubscriptionRenewalCase;
    const subscription = subscriptionById.get(renewalCase.subscription_id);
    if (!subscription || subscription.next_billing_date !== renewalCase.renewal_date) return [];
    return [{
      ...renewalCase,
      subscription: {
        id: subscription.id as string,
        name: subscription.name as string,
        amount: Number(subscription.amount),
        currency: subscription.currency as string,
        billing_cycle: subscription.billing_cycle as "weekly" | "monthly" | "yearly",
        category: subscription.category as string,
        url: subscription.url as string | null,
        is_active: Boolean(subscription.is_active),
        auto_renews: Boolean(subscription.auto_renews),
      },
      attention_state: deriveRenewalAttentionState(renewalCase, today),
      days_until_decision: daysBetweenISO(today, renewalCase.decision_due_date),
      days_until_renewal: daysBetweenISO(today, renewalCase.renewal_date),
      has_invoice: subscriptionsWithDocuments.has(renewalCase.subscription_id),
    } satisfies RenewalInboxItem];
  });
}

export async function getCurrentRenewalCase(
  organizationId: string,
  subscriptionId: string,
): Promise<SubscriptionRenewalCase | null> {
  const supabase = await createClient();
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("next_billing_date")
    .eq("organization_id", organizationId)
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!subscription) return null;

  const { data, error } = await supabase
    .from("subscription_renewal_cases")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("subscription_id", subscriptionId)
    .eq("renewal_date", subscription.next_billing_date as string)
    .maybeSingle();
  if (error) {
    console.error("getCurrentRenewalCase error:", describePgError(error));
    return null;
  }
  return data as SubscriptionRenewalCase | null;
}
