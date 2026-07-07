"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { billingProvider } from "@/modules/billing/services/billing-provider";
import type { ActionResult } from "@/lib/validators/common";

async function getBillingReturnUrl(): Promise<string> {
  const headerStore = await headers();
  const origin =
    headerStore.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  return `${origin}/dashboard/settings/billing`;
}

/**
 * Cancelling a paid subscription is a provider-owned state transition, not a
 * dashboard mutation.
 *
 * Before Phase 9 this action wrote `billing_subscriptions.status = 'canceled'`
 * directly, which let the dashboard forge paid/canceled billing state and
 * diverge from the provider. The provider boundary (migration 092) makes paid
 * activation/cancellation flow through the trusted webhook / provider portal
 * only. This action therefore:
 *   - re-checks `billing.manage` + admin/owner,
 *   - opens the provider's customer portal (where the user actually cancels),
 *   - never touches `billing_subscriptions`, `organization_billing_states`,
 *     plan state, or trial state,
 *   - returns an honest typed error when no provider is connected yet.
 */
export async function cancelSubscriptionAction(
  _prevState: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "billing.manage", intent: "billing" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }

  if (!["admin", "owner"].includes(ctx.membership.roleId)) {
    return { error: "Only admins can cancel the subscription" };
  }

  const session = await billingProvider.createCustomerPortal({
    organizationId: ctx.org.id,
    returnUrl: await getBillingReturnUrl(),
  });

  if (!session.url) {
    // No provider configured — do NOT fake a cancellation. Fail honestly.
    return {
      error:
        "Billing provider is not connected yet. Subscription cancellation must be handled through the billing provider portal.",
    };
  }

  // The provider portal is where the actual cancellation happens; the resulting
  // state change comes back through the trusted webhook, never from here.
  redirect(session.url);
}
