/**
 * A delivered notification stays in the dropdown only while its underlying
 * action item is still actionable. Once that action item is resolved, dismissed,
 * cancelled or (soft-)deleted — e.g. because the source record was deleted — the
 * notification points at a dead resource (→ 404 on click) and must drop out of
 * the list, exactly like the unread COUNT already does
 * (get_unread_notification_count).
 *
 * Notifications with no action_item_id (standalone reminders) are kept here;
 * their source-record cleanup is handled at delete time (see the transaction
 * purge RPC), which removes them by target_url.
 *
 * Pure helper so the rule is unit-tested and shared.
 */
export const ACTIVE_ACTION_ITEM_STATUSES = ["open", "in_progress", "snoozed", "failed"] as const;

type EmbeddedActionItem = { status: string; deleted_at: string | null };

export interface NotificationLiveness {
  action_item_id: string | null;
  /**
   * Embedded action item (PostgREST). A to-one FK embed returns an object (or
   * null); we also tolerate the array shape defensively. null/empty means the
   * action item is deleted or RLS-hidden (e.g. its source record was removed).
   */
  action_item: EmbeddedActionItem | EmbeddedActionItem[] | null;
}

export function isNotificationLive(row: NotificationLiveness): boolean {
  if (!row.action_item_id) return true;
  const ai = Array.isArray(row.action_item) ? row.action_item[0] ?? null : row.action_item;
  if (!ai || ai.deleted_at !== null) return false;
  return (ACTIVE_ACTION_ITEM_STATUSES as readonly string[]).includes(ai.status);
}
