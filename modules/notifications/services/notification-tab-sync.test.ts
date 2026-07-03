import { describe, expect, it } from "vitest";
import { parseNotificationCountMessage, shouldAcceptNotificationCountMessage } from "./notification-tab-sync";

const message = { type: "unread-count-updated" as const, userId: "user-a", organizationId: "org-a", unreadCount: 4, updatedAt: 20 };

describe("notification tab synchronization", () => {
  it("validates and normalizes channel messages", () => {
    expect(parseNotificationCountMessage(message)).toEqual(message);
    expect(parseNotificationCountMessage({ ...message, unreadCount: -3 })?.unreadCount).toBe(0);
    expect(parseNotificationCountMessage({ ...message, type: "unknown" })).toBeNull();
  });

  it("rejects another user, organization, and stale state", () => {
    expect(shouldAcceptNotificationCountMessage(message, { userId: "user-a", organizationId: "org-a", updatedAt: 19 })).toBe(true);
    expect(shouldAcceptNotificationCountMessage(message, { userId: "user-b", organizationId: "org-a", updatedAt: 19 })).toBe(false);
    expect(shouldAcceptNotificationCountMessage(message, { userId: "user-a", organizationId: "org-b", updatedAt: 19 })).toBe(false);
    expect(shouldAcceptNotificationCountMessage(message, { userId: "user-a", organizationId: "org-a", updatedAt: 20 })).toBe(false);
  });
});
