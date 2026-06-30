import { describe, expect, it } from "vitest";
import { resolveMonthRange } from "./month-range";

// Fixed "now": 2026-06-28 (UTC). Current month = June 2026.
const NOW = new Date("2026-06-28T12:00:00.000Z");

describe("resolveMonthRange", () => {
  it("defaults to the current UTC month when no param is given", () => {
    const r = resolveMonthRange(undefined, NOW);
    expect(r).toMatchObject({
      month: "2026-06",
      monthStart: "2026-06-01",
      nextMonthStart: "2026-07-01",
      label: "June 2026",
      isCurrent: true,
      prevMonth: "2026-05",
      nextMonth: null, // no future navigation from the current month
    });
  });

  it("resolves a valid past month and exposes prev/next keys", () => {
    const r = resolveMonthRange("2026-03", NOW);
    expect(r).toMatchObject({
      month: "2026-03",
      monthStart: "2026-03-01",
      nextMonthStart: "2026-04-01",
      label: "March 2026",
      isCurrent: false,
      prevMonth: "2026-02",
      nextMonth: "2026-04",
    });
  });

  it("crosses a year boundary correctly", () => {
    const r = resolveMonthRange("2025-12", NOW);
    expect(r).toMatchObject({
      monthStart: "2025-12-01",
      nextMonthStart: "2026-01-01",
      prevMonth: "2025-11",
      nextMonth: "2026-01",
      label: "December 2025",
    });
  });

  it("clamps a future month to the current month", () => {
    const r = resolveMonthRange("2026-09", NOW);
    expect(r.month).toBe("2026-06");
    expect(r.isCurrent).toBe(true);
    expect(r.nextMonth).toBeNull();
  });

  it("falls back to the current month on malformed input", () => {
    for (const bad of ["", "2026", "2026-13", "nope", "2026-00", "06-2026"]) {
      expect(resolveMonthRange(bad, NOW).month).toBe("2026-06");
    }
  });

  it("treats the month right before current as having next = current", () => {
    const r = resolveMonthRange("2026-05", NOW);
    expect(r.isCurrent).toBe(false);
    expect(r.nextMonth).toBe("2026-06");
  });
});
