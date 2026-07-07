import "server-only";

import { createClient } from "@/lib/supabase/server";
import { parseClaimTrialResult } from "./entitlement";
import type { ClaimTrialResult } from "../types/entitlement.types";

/**
 * Explicitly claim the one-per-identity trial for an organization (RPC
 * claim_trial_for_current_user, migration 089).
 *
 * All authorization happens inside the RPC (auth.uid() → membership →
 * can_manage_billing/owner → confirmed email → billing state), and the claim
 * is race-safe via the unique constraints on billing_trial_claims. The caller
 * passes only the server-resolved organization id (e.g. from requireOrg) —
 * never client-supplied — because the RPC additionally re-checks membership.
 *
 * Trials are normally granted automatically at organization creation
 * (create_organization → init_trial_subscription); this is the explicit path
 * for flows that need to claim after the fact. Uses the RLS-scoped
 * authenticated client — no service role.
 */
export async function claimTrialForCurrentUser(
  organizationId: string,
): Promise<ClaimTrialResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("claim_trial_for_current_user", {
    p_organization_id: organizationId,
  });

  if (error) {
    console.error("claimTrialForCurrentUser RPC error:", error.message);
    return { ok: false, reason: "internal_error" };
  }

  return parseClaimTrialResult(data);
}
