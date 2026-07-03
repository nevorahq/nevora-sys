"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeUnreadCount } from "../unread-count";

export async function fetchUnreadNotificationCount(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<number | null> {
  const { data, error } = await supabase.rpc("get_unread_notification_count", {
    p_organization_id: organizationId,
  });
  return error ? null : normalizeUnreadCount(data);
}

export function shouldApplyUnreadCountResponse(
  requestId: number,
  latestRequestId: number,
  active: boolean,
): boolean {
  return active && requestId === latestRequestId;
}
