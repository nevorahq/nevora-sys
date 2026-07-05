import { describe, expect, it } from "vitest";
import { calculateNextPaymentDate, previousDay } from "./calculate-next-payment-date";

describe("calculateNextPaymentDate", () => {
  it("advances weekly by seven days (anchor irrelevant)", () => {
    expect(calculateNextPaymentDate("2026-07-15", "weekly", 15)).toBe("2026-07-22");
  });

  it("keeps the anchor day for monthly", () => {
    expect(calculateNextPaymentDate("2026-07-15", "monthly", 15)).toBe("2026-08-15");
  });

  it("does not shift the schedule when paid late (anchor preserved)", () => {
    // Due 2026-07-15, paid 2026-07-18 — next is still the 15th, not the 18th.
    expect(calculateNextPaymentDate("2026-07-15", "monthly", 15)).toBe("2026-08-15");
  });

  it("restores the anchor after an end-of-month clamp", () => {
    // 31 anchor: Feb clamps to 28, but March returns to 31.
    expect(calculateNextPaymentDate("2026-01-31", "monthly", 31)).toBe("2026-02-28");
    expect(calculateNextPaymentDate("2026-02-28", "monthly", 31)).toBe("2026-03-31");
  });

  it("falls back to the input day when anchor is missing", () => {
    expect(calculateNextPaymentDate("2026-07-10", "monthly", null)).toBe("2026-08-10");
    expect(calculateNextPaymentDate("2026-07-10", "monthly")).toBe("2026-08-10");
  });

  it("advances yearly and clamps leap days", () => {
    expect(calculateNextPaymentDate("2024-02-29", "yearly", 29)).toBe("2025-02-28");
  });

  it("crosses the year boundary for monthly", () => {
    expect(calculateNextPaymentDate("2026-12-15", "monthly", 15)).toBe("2027-01-15");
  });
});

describe("previousDay", () => {
  it("returns the day before", () => {
    expect(previousDay("2026-08-15")).toBe("2026-08-14");
  });

  it("crosses month boundaries", () => {
    expect(previousDay("2026-08-01")).toBe("2026-07-31");
  });
});
