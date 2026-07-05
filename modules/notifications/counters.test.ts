import { describe, expect, it } from "vitest";
import { normalizeNotificationCounters } from "./counters";

describe("notification counters", () => {
  it("keeps delivery and obligation counters separate", () => {
    expect(normalizeNotificationCounters([{ unread: 0, attention: 4, upcoming: 2, due_today: 1, overdue: 1, urgent: 2, recent_actions: 3 }]))
      .toEqual({ unread: 0, attention: 4, upcoming: 2, dueToday: 1, overdue: 1, urgent: 2, recentActions: 3 });
  });

  it("defaults recentActions to 0 when the RPC row omits it (pre-migration rows)", () => {
    const result = normalizeNotificationCounters([{ unread: 1, attention: 0, upcoming: 0, due_today: 0, overdue: 0, urgent: 0 }]);
    expect(result.recentActions).toBe(0);
  });
});
