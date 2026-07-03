import { EMPTY_NOTIFICATION_COUNTERS, type NotificationCounters } from "./types";
import { normalizeUnreadCount } from "./unread-count";

export function normalizeNotificationCounters(value: unknown): NotificationCounters {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return { ...EMPTY_NOTIFICATION_COUNTERS };
  const data = row as Record<string, unknown>;
  return {
    unread: normalizeUnreadCount(data.unread),
    attention: normalizeUnreadCount(data.attention),
    upcoming: normalizeUnreadCount(data.upcoming),
    dueToday: normalizeUnreadCount(data.due_today ?? data.dueToday),
    overdue: normalizeUnreadCount(data.overdue),
    urgent: normalizeUnreadCount(data.urgent),
  };
}
