import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface InviteInfo {
  organizationId: string;
  organizationName: string;
  role: string;
  valid: boolean;
}

/**
 * Публичная инфа об инвайте по токену (для /invite/<token>).
 * Через RPC get_invite_info (SECURITY DEFINER) — доступно и до входа.
 * null — токен не найден.
 */
export async function getInviteInfo(token: string): Promise<InviteInfo | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_invite_info", {
    p_token: token,
  });

  if (error) {
    console.error("getInviteInfo error:", error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    organizationId:   row.organization_id as string,
    organizationName: row.organization_name as string,
    role:             row.role as string,
    valid:            Boolean(row.valid),
  };
}
