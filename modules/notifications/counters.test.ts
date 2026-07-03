import { describe, expect, it } from "vitest";
import { normalizeNotificationCounters } from "./counters";

describe("notification counters", () => {
  it("keeps delivery and obligation counters separate", () => {
    expect(normalizeNotificationCounters([{ unread: 0, attention: 4, upcoming: 2, due_today: 1, overdue: 1, urgent: 2 }]))
      .toEqual({ unread: 0, attention: 4, upcoming: 2, dueToday: 1, overdue: 1, urgent: 2 });
  });
});
