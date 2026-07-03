// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  markAll: vi.fn(),
  removeChannel: vi.fn(),
  titleRestore: vi.fn(),
  faviconRestore: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    };
    return { channel: vi.fn(() => channel), removeChannel: mocks.removeChannel };
  },
}));
vi.mock("../actions/notification-read.actions", () => ({
  markAllNotificationsAsRead: mocks.markAll,
}));
vi.mock("../services/fetch-unread-notification-count", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/fetch-unread-notification-count")>();
  return { ...actual, fetchUnreadNotificationCount: vi.fn().mockResolvedValue(null) };
});
vi.mock("../services/browser-title-manager", () => ({
  BrowserTitleManager: class {
    apply = vi.fn();
    restore = mocks.titleRestore;
  },
}));
vi.mock("../services/favicon-badge-manager", () => ({
  FaviconBadgeManager: class {
    apply = vi.fn().mockResolvedValue(undefined);
    restore = mocks.faviconRestore;
  },
}));
vi.mock("@/modules/settings/notifications/services/notification-tab-coordinator", () => ({ claimNotification: vi.fn() }));
vi.mock("@/modules/settings/notifications/services/notification-sound", () => ({
  isNotificationAudioUnlocked: vi.fn(() => false),
  playNotificationSound: vi.fn(),
}));
vi.mock("@/shared/ui/toast", () => ({ Toast: ({ message }: { message: string | null }) => <div>{message}</div> }));

import { NotificationProvider, useNotificationIndicator } from "./notification-provider";

const preferences = {
  browserNotificationsEnabled: false,
  inAppSoundEnabled: false,
  soundMode: "important" as const,
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

function Consumer() {
  const { unreadCount, markAllAsRead } = useNotificationIndicator();
  return <button type="button" onClick={() => void markAllAsRead()}>{unreadCount}</button>;
}

function CounterConsumer() {
  const { counters, markAllAsRead } = useNotificationIndicator();
  return <button type="button" onClick={() => void markAllAsRead()}>{counters.unread}/{counters.urgent}</button>;
}

describe("NotificationProvider", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps the authoritative count when mark-all fails and reports the failure", async () => {
    mocks.markAll.mockResolvedValue({ ok: false, unreadCount: 0 });
    const user = userEvent.setup();
    const view = render(
      <NotificationProvider organizationId="org-a" userId="user-a" initialPreferences={preferences} initialUnreadCount={5}>
        <Consumer />
      </NotificationProvider>,
    );

    await user.click(screen.getByRole("button", { name: "5" }));
    await waitFor(() => expect(mocks.markAll).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "5" })).toBeTruthy();
    expect(screen.getByText("Could not mark notifications as read. Please try again.")).toBeTruthy();

    view.unmount();
    expect(mocks.titleRestore).toHaveBeenCalledOnce();
    expect(mocks.faviconRestore).toHaveBeenCalledOnce();
    expect(mocks.removeChannel).toHaveBeenCalledOnce();
  });

  it("clears unread while preserving urgent obligation state", async () => {
    mocks.markAll.mockResolvedValue({ ok: true, unreadCount: 0 });
    const user = userEvent.setup();
    render(
      <NotificationProvider organizationId="org-a" userId="user-a" initialPreferences={preferences}
        initialCounters={{ unread: 5, attention: 2, upcoming: 1, dueToday: 1, overdue: 1, urgent: 2 }}>
        <CounterConsumer />
      </NotificationProvider>,
    );
    await user.click(screen.getByRole("button", { name: "5/2" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "0/2" })).toBeTruthy());
  });
});
