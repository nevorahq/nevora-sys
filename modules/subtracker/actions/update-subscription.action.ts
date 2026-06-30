"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent } from "@/lib/events";
import { getSubscriptionSchemas } from "../schemas/subscription.schema";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function updateSubscriptionAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const { updateSubscriptionSchema } = getSubscriptionSchemas(dict.subscriptions.errors);

  const { user, org } = await requireOrg();

  const rawData = {
    subscriptionId: formData.get("subscriptionId") as string,
    name: formData.get("name") as string,
    amount: formData.get("amount") as string,
    currency: formData.get("currency") as string,
    billing_cycle: formData.get("billing_cycle") as string,
    next_billing_date: formData.get("next_billing_date") as string,
    category: formData.get("category") as string,
    url: (formData.get("url") as string) || null,
    note: (formData.get("note") as string) || null,
  };

  const parsed = updateSubscriptionSchema.safeParse(rawData);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  try {
    const supabase = await createClient();

    const { data: updatedSubscription, error } = await supabase
      .from("subscriptions")
      .update({
        name: parsed.data.name,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        billing_cycle: parsed.data.billing_cycle,
        next_billing_date: parsed.data.next_billing_date,
        category: parsed.data.category,
        url: parsed.data.url,
        note: parsed.data.note,
        updated_by: user.id,
      })
      .eq("id", parsed.data.subscriptionId)
      .eq("organization_id", org.id)
      .select("id, workspace_id")
      .single();

    if (error || !updatedSubscription) {
      console.error("updateSubscription error:", error);
      return { error: dict.subscriptions.errors.updateFailed };
    }

    await emitDomainEvent({
      organizationId: org.id,
      workspaceId: (updatedSubscription.workspace_id as string | null) ?? undefined,
      eventName: "subscription.updated",
      aggregateType: "subscription",
      aggregateId: updatedSubscription.id as string,
      payload: {
        name: parsed.data.name,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        billing_cycle: parsed.data.billing_cycle,
        next_billing_date: parsed.data.next_billing_date,
      },
    });
  } catch (err) {
    console.error("updateSubscription unexpected error:", err);
    return { error: dict.subscriptions.errors.serverError };
  }

  revalidatePath(ROUTES.subscriptions);
  revalidatePath(ROUTES.dashboard);
  return {};
}
