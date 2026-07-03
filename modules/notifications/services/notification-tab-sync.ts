import { normalizeUnreadCount } from "../unread-count";

export const NOTIFICATION_COUNT_CHANNEL = "nevora-notification-count";
export const NOTIFICATION_COUNT_STORAGE_KEY = "nevora:notification-count";

export interface NotificationCountMessage {
  type: "unread-count-updated";
  userId: string;
  organizationId: string;
  unreadCount: number;
  updatedAt: number;
}

export function parseNotificationCountMessage(value: unknown): NotificationCountMessage | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<NotificationCountMessage>;
  if (candidate.type !== "unread-count-updated"
    || typeof candidate.userId !== "string"
    || typeof candidate.organizationId !== "string"
    || typeof candidate.updatedAt !== "number"
    || !Number.isFinite(candidate.updatedAt)
    || typeof candidate.unreadCount !== "number"
    || !Number.isFinite(candidate.unreadCount)) return null;
  return { ...candidate, unreadCount: normalizeUnreadCount(candidate.unreadCount) } as NotificationCountMessage;
}

export function shouldAcceptNotificationCountMessage(
  message: NotificationCountMessage,
  context: { userId: string; organizationId: string; updatedAt: number },
): boolean {
  return message.userId === context.userId
    && message.organizationId === context.organizationId
    && message.updatedAt > context.updatedAt;
}
