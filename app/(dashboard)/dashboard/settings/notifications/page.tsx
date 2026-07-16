import { SettingsHeader } from "@/modules/settings/components/SettingsHeader";
import { NotificationSettingsForm } from "@/modules/settings/notifications/components/notification-settings-form";
import { getNotificationPreferences } from "@/modules/settings/notifications/queries/get-notification-preferences";
import { getDictionary } from "@/shared/i18n/get-dictionary";

export default async function NotificationSettingsPage() {
  const [preferences, { dict }] = await Promise.all([getNotificationPreferences(), getDictionary()]);
  const t = dict.settings;
  return (
    <>
      <SettingsHeader title={t.header.notificationsTitle} description={t.header.notificationsDescription} />
      <NotificationSettingsForm initialPreferences={preferences} vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} t={t} />
    </>
  );
}
