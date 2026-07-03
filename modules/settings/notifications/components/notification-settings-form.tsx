"use client";

import { useEffect, useState, useTransition } from "react";
import { BellRingIcon, Volume2Icon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import type { NotificationPreferences } from "@/modules/notifications/types";
import { NOTIFICATION_PREFERENCES_EVENT } from "@/modules/notifications/events";
import { updateNotificationPreferences } from "../actions/update-notification-preferences";
import { registerPushSubscription, removePushSubscription } from "../actions/manage-push-subscription";
import { sendTestNotification } from "../actions/send-test-notification";
import { getBrowserNotificationState, subscribeBrowser, type BrowserNotificationState } from "../services/browser-notifications";
import { isNotificationAudioUnlocked, playNotificationSound, unlockNotificationAudio } from "../services/notification-sound";

const TIMEZONES = ["UTC", "Europe/Chisinau", "Europe/Bucharest", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Dubai"];

export function NotificationSettingsForm({ initialPreferences, vapidPublicKey }: { initialPreferences: NotificationPreferences; vapidPublicKey: string | null }) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [permission, setPermission] = useState<BrowserNotificationState>("default");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setTimeout(() => setPermission(getBrowserNotificationState()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function persist(next: NotificationPreferences, success = "Notification settings saved.") {
    const result = await updateNotificationPreferences(next);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setPreferences(result.preferences);
    window.dispatchEvent(new CustomEvent(NOTIFICATION_PREFERENCES_EVENT, { detail: result.preferences }));
    setError("");
    setStatus(success);
    return true;
  }

  function save() {
    setStatus("");
    setError("");
    startTransition(() => void persist(preferences));
  }

  function enableSound() {
    setStatus("");
    setError("");
    startTransition(async () => {
      try {
        await unlockNotificationAudio(preferences.soundVolume);
        await persist({ ...preferences, inAppSoundEnabled: true }, "In-app sound enabled and activated for this tab.");
      } catch {
        setPreferences((current) => ({ ...current, inAppSoundEnabled: false }));
        setError("Nevora could not play the sound. Check this site's audio permission, then try again.");
      }
    });
  }

  function disableSound() {
    startTransition(() => void persist({ ...preferences, inAppSoundEnabled: false }, "In-app sound disabled."));
  }

  function testSound() {
    setStatus("");
    setError("");
    startTransition(async () => {
      try {
        if (!isNotificationAudioUnlocked()) await unlockNotificationAudio(preferences.soundVolume);
        await playNotificationSound(preferences.soundVolume);
        setStatus("Test sound played.");
      } catch {
        setError("The test sound could not play. Enable audio for this site and try again.");
      }
    });
  }

  function enableBrowserNotifications() {
    setStatus("");
    setError("");
    startTransition(async () => {
      const state = getBrowserNotificationState();
      if (state === "unsupported") {
        setPermission(state);
        setError("This browser does not support Web Push notifications.");
        return;
      }
      if (state === "denied") {
        setPermission(state);
        setError("Notifications are blocked. Restore permission in your browser's site settings, then return here.");
        return;
      }
      if (!vapidPublicKey) {
        setError("Browser notifications are not configured on this Nevora deployment.");
        return;
      }
      const granted = state === "granted" ? state : await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") {
        setError(granted === "denied" ? "Notifications were denied. Restore permission in browser site settings." : "Permission was not granted.");
        return;
      }
      try {
        const subscription = await subscribeBrowser(vapidPublicKey);
        const registered = await registerPushSubscription(subscription.toJSON());
        if (!registered.ok) throw new Error(registered.error);
        await persist({ ...preferences, browserNotificationsEnabled: true }, "Browser notifications enabled on this device.");
      } catch {
        setError("Nevora could not register this browser for notifications. Please try again.");
      }
    });
  }

  function disableBrowserNotifications() {
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker?.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await removePushSubscription(subscription.endpoint);
          await subscription.unsubscribe();
        }
        await persist({ ...preferences, browserNotificationsEnabled: false }, "Browser notifications disabled on this device.");
      } catch {
        setError("Could not disable this browser subscription. Please try again.");
      }
    });
  }

  function sendTest() {
    setStatus("");
    setError("");
    startTransition(async () => {
      const result = await sendTestNotification();
      if (result.ok) setStatus(result.message);
      else setError(result.message);
    });
  }

  const browserEnabled = preferences.browserNotificationsEnabled && permission === "granted";
  const update = <K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) => setPreferences((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-6">
      <section className="soft-card space-y-4 p-5 sm:p-6" aria-labelledby="notification-channels">
        <div>
          <h2 id="notification-channels" className="text-lg font-semibold text-text-primary">Delivery channels</h2>
          <p className="mt-1 text-sm text-text-muted">In-app sound works while Nevora is open. Browser notifications can appear in the background and use your operating system&apos;s default sound.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-(--neu-radius-md) border border-border-soft p-4">
            <div className="flex items-start gap-3"><Volume2Icon className="mt-0.5 text-accent-green" size={20} /><div><h3 className="font-medium text-text-primary">In-app sound</h3><p className="text-sm text-text-muted">{preferences.inAppSoundEnabled ? "Enabled. Activate again after reloading a tab if playback is blocked." : "Off by default and activated only by your click."}</p></div></div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={preferences.inAppSoundEnabled ? disableSound : enableSound} isLoading={pending}>{preferences.inAppSoundEnabled ? "Disable sound" : "Enable sound"}</Button>
              <Button type="button" variant="ghost" onClick={testSound} disabled={pending}>Play test sound</Button>
            </div>
          </div>
          <div className="rounded-(--neu-radius-md) border border-border-soft p-4">
            <div className="flex items-start gap-3"><BellRingIcon className="mt-0.5 text-accent-yellow" size={20} /><div><h3 className="font-medium text-text-primary">Browser notifications</h3><p className="text-sm text-text-muted">Permission: {permission}. Background sound and Do Not Disturb are controlled by your device.</p></div></div>
            <div className="mt-4"><Button type="button" variant="secondary" onClick={browserEnabled ? disableBrowserNotifications : enableBrowserNotifications} isLoading={pending} disabled={permission === "unsupported"}>{browserEnabled ? "Disable browser notifications" : "Enable browser notifications"}</Button></div>
            {permission === "denied" && <p className="mt-3 text-xs text-danger">Open your browser&apos;s site settings for Nevora and change Notifications from Block to Allow.</p>}
          </div>
        </div>
      </section>

      <section className="soft-card space-y-5 p-5 sm:p-6" aria-labelledby="sound-rules">
        <h2 id="sound-rules" className="text-lg font-semibold text-text-primary">Sound and quiet hours</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Select id="sound-mode" label="Sound mode" value={preferences.soundMode} onChange={(event) => update("soundMode", event.target.value as NotificationPreferences["soundMode"])} options={[{ value: "important", label: "Important only" }, { value: "all", label: "All notifications" }, { value: "off", label: "Off" }]} />
          <Input id="sound-volume" type="range" min="0" max="1" step="0.05" label={`Volume (${Math.round(preferences.soundVolume * 100)}%)`} value={preferences.soundVolume} onChange={(event) => update("soundVolume", Number(event.target.value))} />
          <Checkbox id="quiet-hours" label="Enable quiet hours" checked={preferences.quietHoursEnabled} onChange={(event) => update("quietHoursEnabled", event.target.checked)} />
          <Select id="notification-timezone" label="Timezone" value={preferences.timezone} onChange={(event) => update("timezone", event.target.value)} options={(TIMEZONES.includes(preferences.timezone) ? TIMEZONES : [preferences.timezone, ...TIMEZONES]).map((value) => ({ value, label: value }))} />
          <Input id="quiet-start" type="time" label="Quiet hours start" value={preferences.quietHoursStart} onChange={(event) => update("quietHoursStart", event.target.value)} disabled={!preferences.quietHoursEnabled} />
          <Input id="quiet-end" type="time" label="Quiet hours end" value={preferences.quietHoursEnd} onChange={(event) => update("quietHoursEnd", event.target.value)} disabled={!preferences.quietHoursEnabled} />
        </div>
      </section>

      <section className="soft-card space-y-4 p-5 sm:p-6" aria-labelledby="notification-categories">
        <div><h2 id="notification-categories" className="text-lg font-semibold text-text-primary">Notification categories</h2><p className="mt-1 text-sm text-text-muted">Disabled categories still remain visible as Action Center items.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Checkbox id="category-tasks" label="Overdue tasks" checked={preferences.taskRemindersEnabled} onChange={(event) => update("taskRemindersEnabled", event.target.checked)} />
          <Checkbox id="category-subscriptions" label="Upcoming subscription renewals" checked={preferences.subscriptionRemindersEnabled} onChange={(event) => update("subscriptionRemindersEnabled", event.target.checked)} />
          <Checkbox id="category-payments" label="Planned payments" checked={preferences.paymentRemindersEnabled} onChange={(event) => update("paymentRemindersEnabled", event.target.checked)} />
          <Checkbox id="category-documents" label="Documents requiring review" checked={preferences.documentReviewEnabled} onChange={(event) => update("documentReviewEnabled", event.target.checked)} />
          <Checkbox id="category-actions" label="Important Action Center items" checked={preferences.actionCenterEnabled} onChange={(event) => update("actionCenterEnabled", event.target.checked)} />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className={error ? "text-sm text-danger" : "text-sm text-accent-green"}>{error || status}</p>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={sendTest} disabled={pending}>Send test notification</Button><Button type="button" onClick={save} isLoading={pending}>{pending ? "Saving…" : "Save preferences"}</Button></div>
      </div>
    </div>
  );
}
