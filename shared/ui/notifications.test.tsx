// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en } from "@/shared/i18n/dictionaries/en";

const markAll = vi.fn();
vi.mock("@/modules/notifications/components/notification-provider", () => ({
  useNotificationIndicator: () => ({ unreadCount: 3, markAllAsRead: markAll }),
}));

import { Notifications } from "./notifications";

describe("Notifications unread controls", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("exposes the unread count and a keyboard-accessible mark-all action", async () => {
    const user = userEvent.setup();
    render(<Notifications overdueCount={0} renewals={[]} bookingRequests={[]} dict={en} />);
    const trigger = screen.getByRole("button", { name: "Notifications, 3 unread" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Mark all as read (3)" }));
    expect(markAll).toHaveBeenCalledTimes(1);
  });
});
