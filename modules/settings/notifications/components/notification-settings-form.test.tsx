// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/modules/notifications/preferences";
import { en } from "@/shared/i18n/dictionaries/en";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  unlock: vi.fn(),
  play: vi.fn(),
  isUnlocked: vi.fn(),
  getState: vi.fn(),
  subscribe: vi.fn(),
  register: vi.fn(),
  remove: vi.fn(),
  sendTest: vi.fn(),
}));

vi.mock("../actions/update-notification-preferences", () => ({ updateNotificationPreferences: mocks.update }));
vi.mock("../actions/manage-push-subscription", () => ({ registerPushSubscription: mocks.register, removePushSubscription: mocks.remove }));
vi.mock("../actions/send-test-notification", () => ({ sendTestNotification: mocks.sendTest }));
vi.mock("../services/notification-sound", () => ({ isNotificationAudioUnlocked: mocks.isUnlocked, unlockNotificationAudio: mocks.unlock, playNotificationSound: mocks.play }));
vi.mock("../services/browser-notifications", () => ({
  getBrowserNotificationState: mocks.getState,
  subscribeBrowser: mocks.subscribe,
}));

import { NotificationSettingsForm } from "./notification-settings-form";

describe("NotificationSettingsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getState.mockReturnValue("default");
    mocks.unlock.mockResolvedValue(undefined);
    mocks.play.mockResolvedValue(undefined);
    mocks.isUnlocked.mockReturnValue(false);
    mocks.update.mockImplementation(async (value) => ({ ok: true, preferences: value }));
    mocks.subscribe.mockResolvedValue({ toJSON: () => ({ endpoint: "https://push.example/1", expirationTime: null, keys: { p256dh: "p".repeat(30), auth: "a".repeat(10) } }) });
    mocks.register.mockResolvedValue({ ok: true });
    mocks.sendTest.mockResolvedValue({ ok: true, message: "Test notification sent." });
    vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn().mockResolvedValue("granted") });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("unlocks audio before persisting the enabled preference", async () => {
    const user = userEvent.setup();
    render(<NotificationSettingsForm initialPreferences={DEFAULT_NOTIFICATION_PREFERENCES} vapidPublicKey="AQIDBA" t={en.settings} />);
    await user.click(screen.getByRole("button", { name: "Enable sound" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ inAppSoundEnabled: true })));
    expect(mocks.unlock.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
  });

  it("leaves sound disabled when browser playback fails", async () => {
    mocks.unlock.mockRejectedValueOnce(new Error("blocked"));
    const user = userEvent.setup();
    render(<NotificationSettingsForm initialPreferences={DEFAULT_NOTIFICATION_PREFERENCES} vapidPublicKey="AQIDBA" t={en.settings} />);
    await user.click(screen.getByRole("button", { name: "Enable sound" }));
    expect(await screen.findByText(/could not play the sound/i)).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Enable sound" })).toBeTruthy();
  });

  it("requests notification permission only after the explicit button click", async () => {
    const user = userEvent.setup();
    render(<NotificationSettingsForm initialPreferences={DEFAULT_NOTIFICATION_PREFERENCES} vapidPublicKey="AQIDBA" t={en.settings} />);
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Enable browser notifications" }));
    await waitFor(() => expect(Notification.requestPermission).toHaveBeenCalledTimes(1));
  });

  it("renders denied guidance without requesting permission again", async () => {
    mocks.getState.mockReturnValue("denied");
    const user = userEvent.setup();
    render(<NotificationSettingsForm initialPreferences={DEFAULT_NOTIFICATION_PREFERENCES} vapidPublicKey="AQIDBA" t={en.settings} />);
    expect(await screen.findByText(/change Notifications from Block to Allow/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Enable browser notifications" }));
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });
});
