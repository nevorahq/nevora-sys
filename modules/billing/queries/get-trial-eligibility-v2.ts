import "server-only";

import { createClient } from "@/lib/supabase/server";
import { parseTrialEligibilityV2 } from "../services/entitlement";
import type { TrialEligibility } from "../types/entitlement.types";

/**
 * Trial eligibility for the current user via the hardened contract (RPC
 * get_trial_eligibility_for_current_user, migration 089). Identity is derived
 * from auth.uid() + confirmed email inside the RPC — no client payload.
 *
 * This is the typed-reason-code successor to getTrialEligibility()
 * (check_trial_eligibility, 086). The legacy query is kept for back-compat;
 * both are UX helpers — duplicate trials are impossible regardless
 * (unique constraints on billing_trial_claims).
 *
 * Transport/RPC error → fail-closed to "trial_not_available".
 */
export async function getTrialEligibilityForCurrentUser(): Promise<TrialEligibility> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_trial_eligibility_for_current_user");

  if (error) {
    console.error("getTrialEligibilityForCurrentUser RPC error:", error.message);
    return { eligible: false, reason: "trial_not_available" };
  }

  return parseTrialEligibilityV2(data);
}
