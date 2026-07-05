import { describe, it, expect } from "vitest";
import { calculateActionDueDate, normalizeReminderOffset } from "./calculate-action-due-date";

describe("calculateActionDueDate", () => {
  it("subtracts the default 3-day offset", () => {
    expect(calculateActionDueDate("2026-08-15")).toBe("2026-08-12");
  });

  it("subtracts a custom offset", () => {
    expect(calculateActionDueDate("2026-08-15", 7)).toBe("2026-08-08");
  });

  it("supports a zero offset (task due on the payment date)", () => {
    expect(calculateActionDueDate("2026-08-15", 0)).toBe("2026-08-15");
  });

  it("crosses a month boundary correctly", () => {
    expect(calculateActionDueDate("2026-08-02", 3)).toBe("2026-07-30");
  });

  it("crosses a year boundary correctly", () => {
    expect(calculateActionDueDate("2026-01-01", 3)).toBe("2025-12-29");
  });

  it("is timezone-safe (no off-by-one across DST)", () => {
    // 3 days before 2026-03-30 (EU DST switch weekend) must be 2026-03-27.
    expect(calculateActionDueDate("2026-03-30", 3)).toBe("2026-03-27");
  });

  it("returns null for missing or malformed dates", () => {
    expect(calculateActionDueDate(null)).toBeNull();
    expect(calculateActionDueDate(undefined)).toBeNull();
    expect(calculateActionDueDate("")).toBeNull();
    expect(calculateActionDueDate("2026/08/15")).toBeNull();
    expect(calculateActionDueDate("not-a-date")).toBeNull();
  });

  it("clamps out-of-range offsets", () => {
    // Negative offset clamps to 0 → same day.
    expect(calculateActionDueDate("2026-08-15", -5)).toBe("2026-08-15");
  });
});

describe("normalizeReminderOffset", () => {
  it("defaults null/undefined/NaN to 3", () => {
    expect(normalizeReminderOffset(null)).toBe(3);
    expect(normalizeReminderOffset(undefined)).toBe(3);
    expect(normalizeReminderOffset(Number.NaN)).toBe(3);
  });

  it("clamps to [0, 365]", () => {
    expect(normalizeReminderOffset(-1)).toBe(0);
    expect(normalizeReminderOffset(400)).toBe(365);
    expect(normalizeReminderOffset(10)).toBe(10);
  });

  it("truncates fractional offsets", () => {
    expect(normalizeReminderOffset(3.9)).toBe(3);
  });
});
