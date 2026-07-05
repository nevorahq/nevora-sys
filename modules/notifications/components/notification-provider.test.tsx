// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  markAll: vi.fn(),
  markOne: vi.fn(),
  removeChannel: vi.fn(),
  titleRestore: vi.fn(),
  faviconApply: vi.fn(),
  faviconRestore: vi.fn(),
  unlock: vi.fn(),
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
  markNotificationAsRead: mocks.markOne,
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
    apply = mocks.faviconApply.mockResolvedValue(undefined);
    restore = mocks.faviconRestore;
  },
}));
vi.mock("@/modules/settings/notifications/services/notification-tab-coordinator", () => ({ claimNotification: vi.fn() }));
vi.mock("@/modules/settings/notifications/services/notification-sound", () => ({
  isNotificationAudioUnlocked: vi.fn(() => false),
  playNotificationSound: vi.fn(),
  unlockNotificationAudio: mocks.unlock,
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

function NotificationListConsumer() {
  const { notifications, markAsRead } = useNotificationIndicator();
  return (
    <div>
      <span>{notifications.length}</span>
      {notifications.map((notification) => (
        <button key={notification.id} type="button" onClick={() => void markAsRead(notification.id)}>
          {notification.title}
        </button>
      ))}
    </div>
  );
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
        initialCounters={{ unread: 5, attention: 2, upcoming: 1, dueToday: 1, overdue: 1, urgent: 2, recentActions: 3 }}>
        <CounterConsumer />
      </NotificationProvider>,
    );
    await user.click(screen.getByRole("button", { name: "5/2" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "0/2" })).toBeTruthy());
  });

  it("keeps the favicon marker tied to unread notifications, not urgent-only obligations", async () => {
    render(
      <NotificationProvider organizationId="org-a" userId="user-a" initialPreferences={preferences}
        initialCounters={{ unread: 0, attention: 2, upcoming: 0, dueToday: 1, overdue: 1, urgent: 2, recentActions: 0 }}>
        <CounterConsumer />
      </NotificationProvider>,
    );

    await waitFor(() => expect(mocks.faviconApply).toHaveBeenCalled());
    expect(mocks.faviconApply).toHaveBeenCalledWith(0);
    expect(mocks.faviconApply).not.toHaveBeenCalledWith(2);
  });

  it("keeps unread notifications in provider state and removes a single read row", async () => {
    mocks.markOne.mockResolvedValue({ ok: true, unreadCount: 1 });
    const user = userEvent.setup();
    render(
      <NotificationProvider
        organizationId="org-a"
        userId="user-a"
        initialPreferences={preferences}
        initialCounters={{ unread: 2, attention: 0, upcoming: 0, dueToday: 0, overdue: 0, urgent: 0, recentActions: 0 }}
        initialNotifications={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            organization_id: "org-a",
            user_id: "user-a",
            title: "First",
            body: null,
            category: "task",
            priority: "high",
            target_url: "/dashboard/tasks/11111111-1111-4111-8111-111111111111",
            read_at: null,
            created_at: "2026-07-04T08:00:00.000Z",
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            organization_id: "org-a",
            user_id: "user-a",
            title: "Second",
            body: null,
            category: "payment",
            priority: "critical",
            target_url: "/dashboard/money",
            read_at: null,
            created_at: "2026-07-04T09:00:00.000Z",
          },
        ]}
      >
        <NotificationListConsumer />
      </NotificationProvider>,
    );

    expect(screen.getByText("2")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "First" }));
    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "First" })).toBeNull();
    expect(mocks.markOne).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  });

  it("activates in-app sound on the first user gesture when sound is enabled", async () => {
    mocks.unlock.mockResolvedValue(undefined);
    render(
      <NotificationProvider
        organizationId="org-a"
        userId="user-a"
        initialPreferences={{ ...preferences, inAppSoundEnabled: true }}
      >
        <Consumer />
      </NotificationProvider>,
    );

    window.dispatchEvent(new Event("pointerdown"));
    await waitFor(() => expect(mocks.unlock).toHaveBeenCalledWith(0.7));
  });
});
