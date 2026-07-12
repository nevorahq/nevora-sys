import "server-only";

import { getServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * An organization that prevents the user from being deleted right now: the user
 * is its *only* active owner and *other* active members still depend on it.
 * Deleting the account would strand those members with an ownerless org, so we
 * block and tell the user to transfer ownership (or remove the members) first.
 */
export interface DeletionBlockingOrg {
  organizationId: string;
  organizationName: string;
  /** Active members besides the user being deleted. */
  otherActiveMembers: number;
}

/**
 * Result of the pre-flight guard, shared by the request Server Action and the
 * cron purge so both apply the exact same rule.
 */
export interface AccountDeletionGuardResult {
  /** Non-empty => deletion must be refused until the user resolves these. */
  blocking: DeletionBlockingOrg[];
  /**
   * Organizations where the user is the only active member. These are personal
   * orgs and must be cascade-deleted together with the account at purge time —
   * otherwise migration 102's SET NULL on organizations.created_by would leave
   * them as ownerless, memberless shells ("no orphans").
   */
  soloOrganizationIds: string[];
}

interface MembershipRow {
  organization_id: string;
  user_id: string;
  role: string;
  status: string;
}

/**
 * Decide whether `userId` may be deleted, and classify their organizations.
 *
 * Runs under the service-role client (RLS-bypassing) because it must see *every*
 * membership of the affected orgs — co-members and co-owners the caller's own
 * RLS scope may hide — and because the cron purge has no user session at all.
 * Server-only; never import into client code.
 *
 * Rule (see the plan): for each org the user actively belongs to,
 *   - only member  -> solo org, cascade-delete with the account;
 *   - other members exist and the user is the sole active owner -> BLOCK;
 *   - otherwise (another owner exists, or the user isn't the owner) -> safe,
 *     the membership simply detaches on delete.
 */
export async function evaluateAccountDeletion(
  userId: string,
): Promise<AccountDeletionGuardResult> {
  const admin = getServiceRoleClient();
  if (!admin) {
    throw new Error(
      "Account deletion is unavailable: SUPABASE_SERVICE_ROLE_KEY is not configured.",
    );
  }

  // Every org the user is an ACTIVE member of.
  const { data: userMemberships, error: userErr } = await admin
    .from("memberships")
    .select("organization_id, user_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active");
  if (userErr) {
    throw new Error(`Failed to load memberships: ${userErr.message}`);
  }

  const orgIds = (userMemberships ?? []).map((m) => m.organization_id);
  if (orgIds.length === 0) {
    return { blocking: [], soloOrganizationIds: [] };
  }

  // All ACTIVE memberships of those orgs, so we can count co-members/co-owners.
  const { data: allRows, error: allErr } = await admin
    .from("memberships")
    .select("organization_id, user_id, role, status")
    .in("organization_id", orgIds)
    .eq("status", "active");
  if (allErr) {
    throw new Error(`Failed to load org memberships: ${allErr.message}`);
  }

  const byOrg = new Map<string, MembershipRow[]>();
  for (const row of (allRows ?? []) as MembershipRow[]) {
    const list = byOrg.get(row.organization_id) ?? [];
    list.push(row);
    byOrg.set(row.organization_id, list);
  }

  const blockingOrgIds: string[] = [];
  const soloOrganizationIds: string[] = [];

  for (const orgId of orgIds) {
    const members = byOrg.get(orgId) ?? [];
    const otherActiveMembers = members.filter((m) => m.user_id !== userId).length;

    if (otherActiveMembers === 0) {
      soloOrganizationIds.push(orgId);
      continue;
    }

    const userIsOwner = members.some(
      (m) => m.user_id === userId && m.role === "owner",
    );
    const activeOwners = members.filter((m) => m.role === "owner").length;

    if (userIsOwner && activeOwners === 1) {
      blockingOrgIds.push(orgId);
    }
    // else: another owner exists, or the user is not an owner — safe to detach.
  }

  const blocking = await hydrateBlockingOrgs(admin, byOrg, blockingOrgIds, userId);
  return { blocking, soloOrganizationIds };
}

async function hydrateBlockingOrgs(
  admin: NonNullable<ReturnType<typeof getServiceRoleClient>>,
  byOrg: Map<string, MembershipRow[]>,
  blockingOrgIds: string[],
  userId: string,
): Promise<DeletionBlockingOrg[]> {
  if (blockingOrgIds.length === 0) return [];

  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, name")
    .in("id", blockingOrgIds);
  if (error) {
    throw new Error(`Failed to load organization names: ${error.message}`);
  }

  const nameById = new Map<string, string>(
    (orgs ?? []).map((o) => [o.id as string, (o.name as string) ?? "Untitled"]),
  );

  return blockingOrgIds.map((orgId) => ({
    organizationId: orgId,
    organizationName: nameById.get(orgId) ?? "Untitled",
    otherActiveMembers:
      (byOrg.get(orgId) ?? []).filter((m) => m.user_id !== userId).length,
  }));
}
