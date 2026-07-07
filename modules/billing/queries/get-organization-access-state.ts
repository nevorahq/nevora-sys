import "server-only";

import { createClient } from "@/lib/supabase/server";
import { parseAccessState } from "../services/entitlement";
import type { OrgAccessState } from "../types/entitlement.types";

/**
 * Typed access state for an organization (RPC get_organization_access_state,
 * migration 089). Membership and identity are enforced inside the RPC via
 * auth.uid() — the caller passes only the org id it already resolved from
 * server-side context (requireOrg), never client payload.
 *
 * Transport/RPC error → fail-closed to "no_org" (safest UX default; real
 * write-enforcement is RLS + is_organization_writable in the database).
 */
export async function getOrganizationAccessState(
  organizationId: string,
): Promise<OrgAccessState> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_organization_access_state", {
    p_organization_id: organizationId,
  });

  if (error) {
    console.error("getOrganizationAccessState RPC error:", error.message);
    return "no_org";
  }

  return parseAccessState(data);
}
