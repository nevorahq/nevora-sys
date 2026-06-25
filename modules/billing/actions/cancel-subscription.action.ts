"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { cancelSubscriptionSchema } from "../schemas/billing.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function cancelSubscriptionAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { org, membership } = await requireOrg();

  if (!["admin", "owner"].includes(membership.roleId)) {
    return { error: "Only admins can cancel the subscription" };
  }

  const parsed = cancelSubscriptionSchema.safeParse({
    atPeriodEnd: formData.get("atPeriodEnd") !== "false",
  });
  if (!parsed.success) return { error: "Invalid parameters" };

  try {
    const supabase = await createClient();

    const updateData = parsed.data.atPeriodEnd
      ? { cancel_at_period_end: true }
      : { status: "canceled" as const, canceled_at: new Date().toISOString() };

    const { data: sub, error } = await supabase
      .from("billing_subscriptions")
      .update(updateData)
      .eq("organization_id", org.id)
      .neq("status", "canceled")
      .select("id")
      .single();

    if (error || !sub) {
      console.error("cancelSubscription error:", error);
      return { error: "Failed to cancel subscription" };
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        eventName:      "subscription.canceled",
        aggregateType:  "subscription",
        aggregateId:    sub.id,
        payload:        { at_period_end: parsed.data.atPeriodEnd },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "billing_subscriptions",
        entityId:       sub.id,
        action:         "delete",
        metadata:       { source: "dashboard", at_period_end: parsed.data.atPeriodEnd },
      }),
    ]);
  } catch (err) {
    console.error("cancelSubscription unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.billing);
  return {};
}
