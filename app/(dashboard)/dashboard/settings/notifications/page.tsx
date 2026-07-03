import { SettingsHeader } from "@/modules/settings/components/SettingsHeader";
import { NotificationSettingsForm } from "@/modules/settings/notifications/components/notification-settings-form";
import { getNotificationPreferences } from "@/modules/settings/notifications/queries/get-notification-preferences";

export default async function NotificationSettingsPage() {
  const preferences = await getNotificationPreferences();
  return (
    <>
      <SettingsHeader title="Notifications" description="Choose when Nevora may get your attention, without losing anything from Action Center." />
      <NotificationSettingsForm initialPreferences={preferences} vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
    </>
  );
}
