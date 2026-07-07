"use server";

import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { changePlanSchema } from "../schemas/billing.schemas";
import type { ActionResult } from "@/lib/validators/common";
import { createCheckoutSessionForCurrentOrganization } from "./create-checkout-session.action";

export async function changePlanAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // billing.manage (owner/admin) + billing intent — reachable in every
  // non-suspended state so a blocked org can always pay its way back in.
  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "billing.manage", intent: "billing" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }
  const { membership } = ctx;

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

  // Trial Reuse Protection (migration 086): the trial can never be a plan-
  // change target. It is granted exactly once per billing owner identity at
  // organization creation; letting this action set the trial plan back to
  // status='active' would resurrect an expired trial indefinitely.
  if (parsed.data.planSlug === "trial") {
    return {
      error: "The free trial can only be used once. Please choose Start, Pro or Business to continue.",
    };
  }

  return createCheckoutSessionForCurrentOrganization(parsed.data);
}
