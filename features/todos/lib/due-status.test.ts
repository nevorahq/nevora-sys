import { describe, expect, it } from "vitest";
import { getDueStatus } from "./due-status";

// Fixed "now": 2026-06-15 (UTC). today = 2026-06-15.
const NOW = new Date("2026-06-15T12:00:00.000Z");

describe("getDueStatus", () => {
  it("flags a past due date as overdue with a negative day delta", () => {
    expect(getDueStatus("2026-06-14", "todo", NOW)).toEqual({ level: "overdue", days: -1 });
    expect(getDueStatus("2026-06-01", "in_progress", NOW)).toEqual({ level: "overdue", days: -14 });
  });

  it("flags today's due date as due_today", () => {
    expect(getDueStatus("2026-06-15", "todo", NOW)).toEqual({ level: "due_today", days: 0 });
  });

  it("flags the next 1..3 days as due_soon", () => {
    expect(getDueStatus("2026-06-16", "todo", NOW)).toEqual({ level: "due_soon", days: 1 });
    expect(getDueStatus("2026-06-18", "todo", NOW)).toEqual({ level: "due_soon", days: 3 });
  });

  it("does not flag dates beyond the soon window", () => {
    expect(getDueStatus("2026-06-19", "todo", NOW)).toEqual({ level: "none", days: 4 });
  });

  it("never flags a done task, regardless of due date", () => {
    expect(getDueStatus("2026-06-01", "done", NOW)).toEqual({ level: "none", days: 0 });
  });

  it("returns none for a missing or malformed due date", () => {
    expect(getDueStatus(null, "todo", NOW)).toEqual({ level: "none", days: 0 });
    expect(getDueStatus(undefined, "todo", NOW)).toEqual({ level: "none", days: 0 });
    expect(getDueStatus("not-a-date", "todo", NOW)).toEqual({ level: "none", days: 0 });
  });

  it("ignores a time component on the due date string", () => {
    expect(getDueStatus("2026-06-16T09:30:00Z", "todo", NOW)).toEqual({ level: "due_soon", days: 1 });
  });

  it("computes the day delta in UTC regardless of the local clock time", () => {
    // Late-UTC-evening 'now' must still treat the same calendar day as today.
    const lateNow = new Date("2026-06-15T23:59:00.000Z");
    expect(getDueStatus("2026-06-15", "todo", lateNow)).toEqual({ level: "due_today", days: 0 });
  });
});
