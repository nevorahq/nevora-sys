import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface OrgMemberRow {
  id: string;
  userId: string;
  role: string;
  status: "active" | "invited" | "suspended";
  displayName: string | null;
  email: string | null;
  createdAt: string;
}

/**
 * Все участники организации (active + invited + suspended) с display_name.
 * Профили читаются отдельно (RLS co-member policy, migration 020).
 */
export async function getMembers(orgId: string): Promise<OrgMemberRow[]> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("memberships")
    .select("id, user_id, role, status, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });

  if (error || !rows?.length) return [];

  const userIds = rows.map((r) => r.user_id as string);
  const [{ data: profileRows }, { data: contactRows, error: contactError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds),
    supabase.rpc("get_org_member_contact_details", { p_org_id: orgId }),
  ]);

  const nameMap = new Map(
    (profileRows ?? []).map((p) => [p.id as string, p.display_name as string | null]),
  );
  if (contactError) console.error("getMembers contact details error:", contactError);
  const emailMap = new Map(
    ((contactRows ?? []) as { user_id: string; email: string | null }[]).map((row) => [row.user_id, row.email]),
  );

  return rows.map((r) => ({
    id:          r.id as string,
    userId:      r.user_id as string,
    role:        r.role as string,
    status:      r.status as OrgMemberRow["status"],
    displayName: nameMap.get(r.user_id as string) ?? null,
    email:       emailMap.get(r.user_id as string) ?? null,
    createdAt:   r.created_at as string,
  }));
}
