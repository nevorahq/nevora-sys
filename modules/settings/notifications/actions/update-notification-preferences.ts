"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/shared/config/routes";
import type { NotificationPreferences } from "@/modules/notifications/types";
import { notificationPreferencesSchema } from "../schemas/notification-preferences.schema";

export type NotificationPreferenceResult =
  | { ok: true; preferences: NotificationPreferences }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function updateNotificationPreferences(input: unknown): Promise<NotificationPreferenceResult> {
  const parsed = notificationPreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Review the highlighted notification settings.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const context = await requireOrg();
  const supabase = await createClient();
  const value = parsed.data;
  const base = {
    organization_id: context.org.id,
    user_id: context.user.id,
    browser_notifications_enabled: value.browserNotificationsEnabled,
    in_app_sound_enabled: value.inAppSoundEnabled,
    sound_mode: value.soundMode,
    sound_volume: value.soundVolume,
    quiet_hours_enabled: value.quietHoursEnabled,
    quiet_hours_start: value.quietHoursStart,
    quiet_hours_end: value.quietHoursEnd,
    timezone: value.timezone,
    task_reminders_enabled: value.taskRemindersEnabled,
    subscription_reminders_enabled: value.subscriptionRemindersEnabled,
    payment_reminders_enabled: value.paymentRemindersEnabled,
    document_review_enabled: value.documentReviewEnabled,
    action_center_enabled: value.actionCenterEnabled,
  };
  const upsert = (row: Record<string, unknown>) =>
    supabase.from("user_notification_preferences").upsert(row, { onConflict: "organization_id,user_id" });
  let { error } = await upsert({ ...base, telegram_digest_enabled: value.telegramDigestEnabled, digest_hour: value.digestHour });
  // Migration 126 not applied yet: save everything else rather than nothing.
  if (error && (error.code === "PGRST204" || error.code === "42703")) ({ error } = await upsert(base));

  if (error) return { ok: false, error: "Could not save notification settings. Please try again." };
  revalidatePath(ROUTES.settingsNotifications);
  return { ok: true, preferences: value };
}
