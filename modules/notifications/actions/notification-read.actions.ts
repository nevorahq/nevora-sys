"use server";

import { z } from "zod";
import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import { normalizeUnreadCount } from "../unread-count";

const notificationIdSchema = z.string().uuid();

export async function markNotificationAsRead(notificationId: unknown): Promise<{ ok: boolean; unreadCount: number }> {
  const parsed = notificationIdSchema.safeParse(notificationId);
  if (!parsed.success) return { ok: false, unreadCount: 0 };
  const context = await requireOrg();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_notification_read", {
    p_organization_id: context.org.id,
    p_notification_id: parsed.data,
  });
  if (error) return { ok: false, unreadCount: await readCount(supabase, context.org.id) };
  return { ok: true, unreadCount: normalizeUnreadCount(data) };
}

export async function markAllNotificationsAsRead(): Promise<{ ok: boolean; unreadCount: number }> {
  const context = await requireOrg();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_all_visible_notifications_read", {
    p_organization_id: context.org.id,
  });
  return error
    ? { ok: false, unreadCount: await readCount(supabase, context.org.id) }
    : { ok: true, unreadCount: normalizeUnreadCount(data) };
}

async function readCount(supabase: Awaited<ReturnType<typeof createClient>>, organizationId: string): Promise<number> {
  const { data } = await supabase.rpc("get_unread_notification_count", { p_organization_id: organizationId });
  return normalizeUnreadCount(data);
}
