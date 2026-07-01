import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface UserOrganization {
  id: string;
  name: string;
  role: string;
}

/**
 * Организации, где у пользователя ACTIVE membership — источник данных для
 * Organization Switcher. Invited/suspended сюда не попадают (только active).
 *
 * RLS: memberships_select_own (user_id = auth.uid()) + organizations читаются
 * через is_org_member — обе строки принадлежат самому пользователю, cross-
 * tenant утечки нет.
 */
export async function getUserOrganizations(userId: string): Promise<UserOrganization[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("memberships")
    .select("role, organizations ( id, name )")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  const result: UserOrganization[] = [];
  for (const row of data) {
    const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    if (!org) continue;
    result.push({ id: org.id as string, name: org.name as string, role: row.role as string });
  }
  return result;
}
