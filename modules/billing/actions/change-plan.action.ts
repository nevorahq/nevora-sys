"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { changePlanSchema } from "../schemas/billing.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function changePlanAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { org, membership } = await requireOrg();

  if (!["admin", "owner"].includes(membership.roleId)) {
    return { error: "Only admins can change the plan" };
  }

  const parsed = changePlanSchema.safeParse({
    planSlug:     formData.get("planSlug") as string,
    billingCycle: formData.get("billingCycle") as string,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  // A browser request must never activate a paid plan. Until a payment
  // provider webhook exists, Start is activated by a controlled back-office
  // operation after payment is confirmed (see the Start rollout notes).
  // This keeps the UI's upgrade path honest instead of granting €9 plans for
  // free through a Server Action.
  if (parsed.data.planSlug !== "trial") {
    return {
      error: "Plan changes are activated after payment is confirmed. Please contact Nevora support to activate this plan.",
    };
  }

  try {
    const supabase = await createClient();

    const { data: plan } = await supabase
      .from("plans")
      .select("id, slug, name")
      .eq("slug", parsed.data.planSlug)
      .eq("is_active", true)
      .single();

    if (!plan) return { error: "Plan not found" };

    const { data: sub, error } = await supabase
      .from("billing_subscriptions")
      .update({
        plan_id:      plan.id,
        billing_cycle: parsed.data.billingCycle,
        status:        "active",
        cancel_at_period_end: false,
        canceled_at:   null,
      })
      .eq("organization_id", org.id)
      .select("id")
      .single();

    if (error || !sub) {
      console.error("changePlan error:", error);
      return { error: "Failed to update subscription" };
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        eventName:      "subscription.plan_changed",
        aggregateType:  "subscription",
        aggregateId:    sub.id,
        payload:        { plan_slug: parsed.data.planSlug, billing_cycle: parsed.data.billingCycle },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "billing_subscriptions",
        entityId:       sub.id,
        action:         "update",
        newData:        { plan_slug: parsed.data.planSlug, billing_cycle: parsed.data.billingCycle },
        metadata:       { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("changePlan unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.billing);
  return {};
}
