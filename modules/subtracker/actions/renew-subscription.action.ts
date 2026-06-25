"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import type { BillingCycle } from "../constants/subtracker.constants";
import { calculateNextBillingDate } from "../services/calculate-next-billing-date";

export async function renewSubscriptionAction(id: string): Promise<{ error?: string }> {
  if (!uuidSchema.safeParse(id).success) return { error: "Invalid subscription ID" };

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) return { error: "You do not have permission to renew subscriptions." };

  const supabase = await createClient();
  const { data: subscription, error: lookupError } = await supabase
    .from("subscriptions")
    .select("id, name, amount, billing_cycle, next_billing_date, workspace_id")
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .eq("is_active", true)
    .single();

  if (lookupError || !subscription) return { error: "Subscription not found" };

  const today = new Date().toISOString().slice(0, 10);
  if ((subscription.next_billing_date as string) > today) {
    return { error: "This subscription is not due for renewal yet." };
  }

  const nextBillingDate = calculateNextBillingDate(
    subscription.next_billing_date as string,
    subscription.billing_cycle as BillingCycle,
  );

  const { data: renewed, error } = await supabase
    .from("subscriptions")
    .update({ next_billing_date: nextBillingDate, updated_by: ctx.user.id })
    .eq("id", subscription.id)
    .eq("organization_id", ctx.org.id)
    .eq("next_billing_date", subscription.next_billing_date)
    .select("id")
    .maybeSingle();

  if (error || !renewed) {
    console.error("renewSubscription error:", error);
    return { error: "Failed to renew subscription" };
  }

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: (subscription.workspace_id as string | null) ?? undefined,
    eventName: "subscription.renewed",
    aggregateType: "subscription",
    aggregateId: renewed.id as string,
    payload: {
      name: subscription.name as string,
      amount: Number(subscription.amount),
      renewed_at: new Date().toISOString(),
    },
  });

  revalidatePath(ROUTES.subscriptions);
  revalidatePath(ROUTES.dashboard);
  return {};
}
