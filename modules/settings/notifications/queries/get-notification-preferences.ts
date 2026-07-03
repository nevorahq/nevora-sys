import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/modules/notifications/preferences";
import type { NotificationPreferences } from "@/modules/notifications/types";

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const context = await requireOrg();
  const supabase = await createClient();
  const [{ data, error }, { data: profile }] = await Promise.all([
    supabase
      .from("user_notification_preferences")
      .select("browser_notifications_enabled, in_app_sound_enabled, sound_mode, sound_volume, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone, task_reminders_enabled, subscription_reminders_enabled, payment_reminders_enabled, document_review_enabled, action_center_enabled")
      .eq("organization_id", context.org.id)
      .eq("user_id", context.user.id)
      .maybeSingle(),
    supabase.from("profiles").select("timezone").eq("id", context.user.id).maybeSingle(),
  ]);

  if (error) throw new Error(`Unable to load notification preferences: ${error.message}`);
  if (!data) {
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      timezone: (profile?.timezone as string | null) ?? "UTC",
    };
  }

  return {
    browserNotificationsEnabled: data.browser_notifications_enabled as boolean,
    inAppSoundEnabled: data.in_app_sound_enabled as boolean,
    soundMode: data.sound_mode as NotificationPreferences["soundMode"],
    soundVolume: Number(data.sound_volume),
    quietHoursEnabled: data.quiet_hours_enabled as boolean,
    quietHoursStart: String(data.quiet_hours_start).slice(0, 5),
    quietHoursEnd: String(data.quiet_hours_end).slice(0, 5),
    timezone: data.timezone as string,
    taskRemindersEnabled: data.task_reminders_enabled as boolean,
    subscriptionRemindersEnabled: data.subscription_reminders_enabled as boolean,
    paymentRemindersEnabled: data.payment_reminders_enabled as boolean,
    documentReviewEnabled: data.document_review_enabled as boolean,
    actionCenterEnabled: data.action_center_enabled as boolean,
  };
}
