"use server";

import { authorizeSettingsAction } from "../utils/settings-permissions";
import type { SettingsActionState } from "../types/settings.types";

export async function createBillingPortalSession(): Promise<SettingsActionState> {
  if (!(await authorizeSettingsAction("billing.manage"))) {
    return { error: "You do not have permission to manage billing." };
  }

  // Integration point: create a Stripe Customer Portal session here once the provider is configured.
  return { error: "Billing provider is not connected yet." };
}
