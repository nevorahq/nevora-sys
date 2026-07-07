"use server";

import { headers } from "next/headers";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { billingProvider } from "@/modules/billing/services/billing-provider";
import type { SettingsActionState } from "../types/settings.types";

async function getBillingReturnUrl() {
  const headerStore = await headers();
  const origin =
    headerStore.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  return `${origin}/dashboard/settings/billing`;
}

export async function createBillingPortalSession(): Promise<SettingsActionState & { portalUrl?: string }> {
  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "billing.manage", intent: "billing" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }

  if (!["admin", "owner"].includes(ctx.membership.roleId)) {
    return { error: "You do not have permission to manage billing." };
  }

  const session = await billingProvider.createCustomerPortal({
    organizationId: ctx.org.id,
    returnUrl: await getBillingReturnUrl(),
  });

  if (!session.url) {
    return {
      error:
        "Billing provider is not connected yet. Billing portal access will be available after a provider is configured.",
    };
  }

  return { success: "Opening billing portal.", portalUrl: session.url };
}
