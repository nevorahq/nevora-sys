"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
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
  const { error } = await supabase.from("user_notification_preferences").upsert({
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
  }, { onConflict: "organization_id,user_id" });

  if (error) return { ok: false, error: "Could not save notification settings. Please try again." };
  revalidatePath("/dashboard/settings/notifications");
  return { ok: true, preferences: value };
}
