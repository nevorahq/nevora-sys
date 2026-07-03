"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent } from "@/lib/events";
import { releaseOrganizationUsage, reserveOrganizationUsage } from "@/modules/billing";
import { getSubscriptionSchemas } from "../schemas/subscription.schema";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function createSubscriptionAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const { createSubscriptionSchema } = getSubscriptionSchemas(dict.subscriptions.errors);

  const { user, org, workspace } = await requireOrg();

  const rawData = {
    name: formData.get("name") as string,
    amount: formData.get("amount") as string,
    currency: formData.get("currency") as string,
    billing_cycle: formData.get("billing_cycle") as string,
    next_billing_date: formData.get("next_billing_date") as string,
    category: formData.get("category") as string,
    url: (formData.get("url") as string) || null,
    note: (formData.get("note") as string) || null,
  };

  const parsed = createSubscriptionSchema.safeParse(rawData);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  // Live reservation not yet backed by a row; released in the outer catch if we
  // never reach a committed insert (P1-3).
  let reserved = false;
  try {
    await reserveOrganizationUsage(org.id, "subscriptions.count", 1);
    reserved = true;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Subscription limit reached. Upgrade your plan." };
  }

  let newSubId: string;
  try {
    const supabase = await createClient();

    const { data: newSub, error } = await supabase
      .from("subscriptions")
      .insert({
        organization_id: org.id,
        workspace_id: workspace.id,
        created_by: user.id,
        updated_by: user.id,
        name: parsed.data.name,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        billing_cycle: parsed.data.billing_cycle,
        next_billing_date: parsed.data.next_billing_date,
        category: parsed.data.category,
        url: parsed.data.url,
        note: parsed.data.note,
      })
      .select("id")
      .single();

    if (error || !newSub) {
      console.error("createSubscription error:", error);
      await releaseOrganizationUsage(org.id, "subscriptions.count", 1);
      return { error: dict.subscriptions.errors.createFailed };
    }
    reserved = false;
    newSubId = newSub.id as string;

    await emitDomainEvent({
      organizationId: org.id,
      workspaceId: workspace.id,
      eventName: "subscription.created",
      aggregateType: "subscription",
      aggregateId: newSub.id,
      payload: {
        name: parsed.data.name,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        billing_cycle: parsed.data.billing_cycle,
      },
    });
  } catch (err) {
    console.error("createSubscription unexpected error:", err);
    if (reserved) await releaseOrganizationUsage(org.id, "subscriptions.count", 1);
    return { error: dict.subscriptions.errors.serverError };
  }

  revalidatePath(ROUTES.subscriptions);
  revalidatePath(ROUTES.dashboard);
  return { subscriptionId: newSubId };
}
