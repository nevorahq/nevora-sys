import type { NotificationCategory, NotificationPreferences, NotificationPriority } from "./types";

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  browserNotificationsEnabled: false,
  inAppSoundEnabled: false,
  soundMode: "important",
  soundVolume: 0.7,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  timezone: "UTC",
  taskRemindersEnabled: true,
  subscriptionRemindersEnabled: true,
  paymentRemindersEnabled: true,
  documentReviewEnabled: true,
  actionCenterEnabled: true,
};

export function isCategoryEnabled(
  preferences: NotificationPreferences,
  category: NotificationCategory,
): boolean {
  return {
    task: preferences.taskRemindersEnabled,
    subscription: preferences.subscriptionRemindersEnabled,
    payment: preferences.paymentRemindersEnabled,
    document: preferences.documentReviewEnabled,
    action_center: preferences.actionCenterEnabled,
  }[category];
}

export function soundModeAllows(mode: NotificationPreferences["soundMode"], priority: NotificationPriority): boolean {
  if (mode === "off") return false;
  if (mode === "all") return true;
  return priority === "high" || priority === "critical";
}

export function timeInTimezone(date: Date, timezone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;
    return hour && minute ? `${hour}:${minute}` : null;
  } catch {
    return null;
  }
}

export function isWithinQuietHours(
  date: Date,
  preferences: Pick<NotificationPreferences, "quietHoursEnabled" | "quietHoursStart" | "quietHoursEnd" | "timezone">,
): boolean {
  if (!preferences.quietHoursEnabled) return false;
  const current = timeInTimezone(date, preferences.timezone);
  if (!current) return true; // Invalid timezone fails closed for disruptive channels.
  const start = preferences.quietHoursStart.slice(0, 5);
  const end = preferences.quietHoursEnd.slice(0, 5);
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function shouldPlaySound(
  preferences: NotificationPreferences,
  category: NotificationCategory,
  priority: NotificationPriority,
  now = new Date(),
): boolean {
  return preferences.inAppSoundEnabled
    && isCategoryEnabled(preferences, category)
    && soundModeAllows(preferences.soundMode, priority)
    && !isWithinQuietHours(now, preferences);
}
