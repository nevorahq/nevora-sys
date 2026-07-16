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
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

const TIMEZONES = ["UTC", "Europe/Chisinau", "Europe/Bucharest", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Dubai"];

export function NotificationSettingsForm({ initialPreferences, vapidPublicKey, t }: { initialPreferences: NotificationPreferences; vapidPublicKey: string | null; t: Dictionary["settings"] }) {
  const n = t.notifications;
  const [preferences, setPreferences] = useState(initialPreferences);
  const [permission, setPermission] = useState<BrowserNotificationState>("default");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setTimeout(() => setPermission(getBrowserNotificationState()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function persist(next: NotificationPreferences, success = n.saved) {
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
        await persist({ ...preferences, inAppSoundEnabled: true }, n.soundEnabled);
      } catch {
        setPreferences((current) => ({ ...current, inAppSoundEnabled: false }));
        setError(n.soundPlayError);
      }
    });
  }

  function disableSound() {
    startTransition(() => void persist({ ...preferences, inAppSoundEnabled: false }, n.soundDisabled));
  }

  function testSound() {
    setStatus("");
    setError("");
    startTransition(async () => {
      try {
        if (!isNotificationAudioUnlocked()) await unlockNotificationAudio(preferences.soundVolume);
        await playNotificationSound(preferences.soundVolume);
        setStatus(n.testPlayed);
      } catch {
        setError(n.testError);
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
        setError(n.browserUnsupported);
        return;
      }
      if (state === "denied") {
        setPermission(state);
        setError(n.browserBlocked);
        return;
      }
      if (!vapidPublicKey) {
        setError(n.browserNotConfigured);
        return;
      }
      const granted = state === "granted" ? state : await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") {
        setError(granted === "denied" ? n.notificationsDenied : n.permissionNotGranted);
        return;
      }
      try {
        const subscription = await subscribeBrowser(vapidPublicKey);
        const registered = await registerPushSubscription(subscription.toJSON());
        if (!registered.ok) throw new Error(registered.error);
        await persist({ ...preferences, browserNotificationsEnabled: true }, n.browserEnabled);
      } catch {
        setError(n.browserRegisterError);
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
        await persist({ ...preferences, browserNotificationsEnabled: false }, n.browserDisabled);
      } catch {
        setError(n.browserDisableError);
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
          <h2 id="notification-channels" className="text-lg font-semibold text-text-primary">{n.channelsTitle}</h2>
          <p className="mt-1 text-sm text-text-muted">{n.channelsHint}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-(--neu-radius-md) border border-border-soft p-4">
            <div className="flex items-start gap-3"><Volume2Icon className="mt-0.5 text-accent-green" size={20} /><div><h3 className="font-medium text-text-primary">{n.inAppSound}</h3><p className="text-sm text-text-muted">{preferences.inAppSoundEnabled ? n.inAppSoundOn : n.inAppSoundOff}</p></div></div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={preferences.inAppSoundEnabled ? disableSound : enableSound} isLoading={pending}>{preferences.inAppSoundEnabled ? n.disableSound : n.enableSound}</Button>
              <Button type="button" variant="ghost" onClick={testSound} disabled={pending}>{n.testSound}</Button>
            </div>
          </div>
          <div className="rounded-(--neu-radius-md) border border-border-soft p-4">
            <div className="flex items-start gap-3"><BellRingIcon className="mt-0.5 text-accent-yellow" size={20} /><div><h3 className="font-medium text-text-primary">{n.browserTitle}</h3><p className="text-sm text-text-muted">{n.permission}: {permission}. {n.browserHint}</p></div></div>
            <div className="mt-4"><Button type="button" variant="secondary" onClick={browserEnabled ? disableBrowserNotifications : enableBrowserNotifications} isLoading={pending} disabled={permission === "unsupported"}>{browserEnabled ? n.disableBrowser : n.enableBrowser}</Button></div>
            {permission === "denied" && <p className="mt-3 text-xs text-danger">{n.deniedHint}</p>}
          </div>
        </div>
      </section>

      <section className="soft-card space-y-5 p-5 sm:p-6" aria-labelledby="sound-rules">
        <h2 id="sound-rules" className="text-lg font-semibold text-text-primary">{n.soundRulesTitle}</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Select id="sound-mode" label={n.soundMode} value={preferences.soundMode} onChange={(event) => update("soundMode", event.target.value as NotificationPreferences["soundMode"])} options={[{ value: "important", label: n.soundModeImportant }, { value: "all", label: n.soundModeAll }, { value: "off", label: n.soundModeOff }]} />
          <Input id="sound-volume" type="range" min="0" max="1" step="0.05" label={`${n.volume} (${Math.round(preferences.soundVolume * 100)}%)`} value={preferences.soundVolume} onChange={(event) => update("soundVolume", Number(event.target.value))} />
          <Checkbox id="quiet-hours" label={n.enableQuietHours} checked={preferences.quietHoursEnabled} onChange={(event) => update("quietHoursEnabled", event.target.checked)} />
          <Select id="notification-timezone" label={t.profile.timezone} value={preferences.timezone} onChange={(event) => update("timezone", event.target.value)} options={(TIMEZONES.includes(preferences.timezone) ? TIMEZONES : [preferences.timezone, ...TIMEZONES]).map((value) => ({ value, label: value }))} />
          <Input id="quiet-start" type="time" label={n.quietStart} value={preferences.quietHoursStart} onChange={(event) => update("quietHoursStart", event.target.value)} disabled={!preferences.quietHoursEnabled} />
          <Input id="quiet-end" type="time" label={n.quietEnd} value={preferences.quietHoursEnd} onChange={(event) => update("quietHoursEnd", event.target.value)} disabled={!preferences.quietHoursEnabled} />
        </div>
      </section>

      <section className="soft-card space-y-4 p-5 sm:p-6" aria-labelledby="notification-categories">
        <div><h2 id="notification-categories" className="text-lg font-semibold text-text-primary">{n.categoriesTitle}</h2><p className="mt-1 text-sm text-text-muted">{n.categoriesHint}</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Checkbox id="category-tasks" label={n.catTasks} checked={preferences.taskRemindersEnabled} onChange={(event) => update("taskRemindersEnabled", event.target.checked)} />
          <Checkbox id="category-subscriptions" label={n.catSubscriptions} checked={preferences.subscriptionRemindersEnabled} onChange={(event) => update("subscriptionRemindersEnabled", event.target.checked)} />
          <Checkbox id="category-payments" label={n.catPayments} checked={preferences.paymentRemindersEnabled} onChange={(event) => update("paymentRemindersEnabled", event.target.checked)} />
          <Checkbox id="category-documents" label={n.catDocuments} checked={preferences.documentReviewEnabled} onChange={(event) => update("documentReviewEnabled", event.target.checked)} />
          <Checkbox id="category-actions" label={n.catActions} checked={preferences.actionCenterEnabled} onChange={(event) => update("actionCenterEnabled", event.target.checked)} />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className={error ? "text-sm text-danger" : "text-sm text-accent-green"}>{error || status}</p>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={sendTest} disabled={pending}>{n.sendTest}</Button><Button type="button" onClick={save} isLoading={pending}>{pending ? t.common.saving : n.savePreferences}</Button></div>
      </div>
    </div>
  );
}
