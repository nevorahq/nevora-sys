export const NOTIFICATION_CATEGORIES = [
  "task",
  "subscription",
  "payment",
  "document",
  "action_center",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationPriority = "low" | "normal" | "high" | "critical";
export type SoundMode = "all" | "important" | "off";

export interface NotificationCounters {
  unread: number;
  attention: number;
  upcoming: number;
  dueToday: number;
  overdue: number;
  urgent: number;
}

export const EMPTY_NOTIFICATION_COUNTERS: NotificationCounters = {
  unread: 0,
  attention: 0,
  upcoming: 0,
  dueToday: 0,
  overdue: 0,
  urgent: 0,
};

export interface NotificationPreferences {
  browserNotificationsEnabled: boolean;
  inAppSoundEnabled: boolean;
  soundMode: SoundMode;
  soundVolume: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string;
  taskRemindersEnabled: boolean;
  subscriptionRemindersEnabled: boolean;
  paymentRemindersEnabled: boolean;
  documentReviewEnabled: boolean;
  actionCenterEnabled: boolean;
}

export interface UserNotification {
  id: string;
  organization_id: string;
  user_id: string;
  title: string;
  body: string | null;
  category: NotificationCategory;
  priority: NotificationPriority;
  target_url: string | null;
  created_at: string;
}
