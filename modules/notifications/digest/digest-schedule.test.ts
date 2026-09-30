import { describe, expect, it } from "vitest";
import { isInDigestWindow, localMoment, resolveDigestTimezone } from "./digest-schedule";

describe("localMoment", () => {
  it("reads the calendar date and hour in the user's timezone", () => {
    // 06:30 UTC on 30 Sep is 09:30 in Chișinău (UTC+3 in summer time).
    expect(localMoment(new Date("2026-09-30T06:30:00Z"), "Europe/Chisinau")).toEqual({ date: "2026-09-30", hour: 9 });
  });

  it("crosses the date line with the timezone, not with UTC", () => {
    expect(localMoment(new Date("2026-09-30T22:30:00Z"), "Europe/Chisinau")).toEqual({ date: "2026-10-01", hour: 1 });
    expect(localMoment(new Date("2026-10-01T02:00:00Z"), "America/New_York")).toEqual({ date: "2026-09-30", hour: 22 });
  });

  it("follows the DST change", () => {
    // Chișinău moves from UTC+3 to UTC+2 on the last Sunday of October.
    expect(localMoment(new Date("2026-10-26T07:00:00Z"), "Europe/Chisinau")?.hour).toBe(9);
  });

  it("returns null for an unknown timezone", () => {
    expect(localMoment(new Date(), "Mars/Olympus")).toBeNull();
  });
});

describe("isInDigestWindow", () => {
  it("opens at the digest hour and stays open for three hours", () => {
    expect(isInDigestWindow(8, 9)).toBe(false);
    expect(isInDigestWindow(9, 9)).toBe(true);
    expect(isInDigestWindow(11, 9)).toBe(true);
    expect(isInDigestWindow(12, 9)).toBe(false);
  });

  it("never wraps past midnight, so a digest belongs to one local day", () => {
    expect(isInDigestWindow(23, 22)).toBe(true);
    expect(isInDigestWindow(0, 22)).toBe(false);
  });
});

describe("resolveDigestTimezone", () => {
  it("takes the first valid timezone and falls back to UTC", () => {
    expect(resolveDigestTimezone(null, "Europe/Bucharest")).toBe("Europe/Bucharest");
    expect(resolveDigestTimezone("Nope/Nowhere", undefined)).toBe("UTC");
  });
});
