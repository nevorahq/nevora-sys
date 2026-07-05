import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserNotification } from "../types";
import { isNotificationLive } from "./filter-live-notifications";

// Embed the linked action item so we can drop notifications whose action item is
// no longer actionable (resolved/dismissed/deleted) — the same rule the unread
// COUNT applies, keeping the dropdown list consistent with the badge and
// preventing clicks that 404 on a deleted record.
const NOTIFICATION_COLUMNS =
  "id, organization_id, user_id, title, body, category, priority, target_url, read_at, created_at, action_item_id, action_item:action_items(status, deleted_at)" as const;

type NotificationRow = UserNotification & {
  action_item_id: string | null;
  action_item: { status: string; deleted_at: string | null } | null;
};

export async function fetchUnreadNotifications(
  supabase: SupabaseClient,
  organizationId: string,
  limit = 20,
): Promise<UserNotification[]> {
  // Over-fetch so post-filtering still returns up to `limit` live rows.
  const cap = Math.max(1, Math.min(limit, 50));
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .eq("organization_id", organizationId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(cap * 2);

  if (error) return [];

  const rows = (data ?? []) as unknown as NotificationRow[];
  return rows
    .filter(isNotificationLive)
    .slice(0, cap)
    .map(({ action_item_id: _actionItemId, action_item: _actionItem, ...notification }) => notification);
}
