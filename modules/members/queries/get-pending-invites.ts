import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface PendingInvite {
  organizationId: string;
  organizationName: string;
  role: string;
}

/**
 * Приглашения (membership status='invited'), адресованные текущему
 * пользователю — через все организации, не только активную.
 *
 * Через RPC get_pending_invites (SECURITY DEFINER, migration 068), а не
 * прямой select с nested join: RLS SELECT на organizations идёт через
 * is_org_member(), который требует status='active' — у invited-пользователя
 * его ещё нет, поэтому join на organizations вернул бы NULL. RPC читает
 * строго по auth.uid() вызывающего, без параметров — cross-tenant утечка
 * невозможна. Зеркалит get_invite_info/accept_invite/decline_invite (025, 026).
 */
export async function getPendingInvites(): Promise<PendingInvite[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_pending_invites");

  if (error || !data) return [];

  return (data as { organization_id: string; organization_name: string; role: string }[]).map((row) => ({
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    role: row.role,
  }));
}
