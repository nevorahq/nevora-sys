import { describe, it, expect } from "vitest";
import { isNotificationLive } from "./filter-live-notifications";

describe("isNotificationLive", () => {
  it("keeps notifications not tied to an action item (standalone reminders)", () => {
    expect(isNotificationLive({ action_item_id: null, action_item: null })).toBe(true);
  });

  it("keeps notifications whose action item is still actionable", () => {
    for (const status of ["open", "in_progress", "snoozed", "failed"]) {
      expect(isNotificationLive({ action_item_id: "ai", action_item: { status, deleted_at: null } })).toBe(true);
    }
  });

  it("drops notifications whose action item is resolved/dismissed/cancelled", () => {
    for (const status of ["resolved", "dismissed", "cancelled"]) {
      expect(isNotificationLive({ action_item_id: "ai", action_item: { status, deleted_at: null } })).toBe(false);
    }
  });

  it("drops notifications whose action item is soft-deleted (source record removed)", () => {
    expect(isNotificationLive({ action_item_id: "ai", action_item: { status: "open", deleted_at: "2026-07-04T00:00:00Z" } })).toBe(false);
  });

  it("drops notifications with a dangling action_item_id (embed came back null via RLS)", () => {
    // A deleted transaction's action item is hidden by RLS → embed is null.
    expect(isNotificationLive({ action_item_id: "ai", action_item: null })).toBe(false);
  });
});
