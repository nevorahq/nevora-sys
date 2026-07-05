// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/shared/i18n/dictionaries/en";

const markAll = vi.fn();
const markAsRead = vi.fn();
vi.mock("@/modules/notifications/components/notification-provider", () => ({
  useNotificationIndicator: () => ({
    unreadCount: 3,
    counters: { unread: 3, attention: 0, upcoming: 0, dueToday: 0, overdue: 0, urgent: 0, recentActions: 0 },
    notifications: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        organization_id: "org-a",
        user_id: "user-a",
        title: "Pay supplier invoice",
        body: "This planned payment is overdue.",
        category: "payment",
        priority: "critical",
        target_url: "/dashboard/money",
        read_at: null,
        created_at: "2026-07-04T08:00:00.000Z",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        organization_id: "org-a",
        user_id: "user-a",
        title: "Send client update",
        body: "This task is overdue.",
        category: "task",
        priority: "high",
        target_url: "/dashboard/tasks/22222222-2222-4222-8222-222222222222",
        read_at: null,
        created_at: "2026-07-04T09:00:00.000Z",
      },
    ],
    markAllAsRead: markAll,
    markAsRead,
    refreshCounters: vi.fn(),
  }),
}));

import { Notifications } from "./notifications";

describe("Notifications unread controls", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("exposes the unread count and a keyboard-accessible mark-all action", async () => {
    const user = userEvent.setup();
    render(<Notifications dict={en} />);
    const trigger = screen.getByRole("button", { name: "Notifications, 3 unread" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Mark all as read (3)" }));
    expect(markAll).toHaveBeenCalledTimes(1);
  });

  it("renders each notification row instead of a grouped overdue item", async () => {
    const user = userEvent.setup();
    render(<Notifications dict={en} />);

    await user.click(screen.getByRole("button", { name: "Notifications, 3 unread" }));

    expect(screen.getByText("Pay supplier invoice")).toBeTruthy();
    expect(screen.getByText("Send client update")).toBeTruthy();
    expect(screen.queryByText("2 overdue tasks")).toBeNull();

    await user.click(screen.getByText("Send client update"));
    expect(markAsRead).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
  });
});
