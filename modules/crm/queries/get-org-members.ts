import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface OrgMember {
  id: string;
  displayName: string | null;
}

/**
 * Returns all active org members with their display names.
 * Requires migration 020 (profiles org-member RLS policy).
 * Degrades gracefully if policy not applied — displayName will be null.
 */
export async function getOrgMembers(orgId: string): Promise<OrgMember[]> {
  const supabase = await createClient();

  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("status", "active");

  if (error || !memberships?.length) return [];

  const userIds = memberships.map((m) => m.user_id as string);

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);

  const profileMap = new Map(
    (profileRows ?? []).map((p) => [p.id as string, p.display_name as string | null]),
  );

  return userIds.map((uid) => ({
    id: uid,
    displayName: profileMap.get(uid) ?? null,
  }));
}
