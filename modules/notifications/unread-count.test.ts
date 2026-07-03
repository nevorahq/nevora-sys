import { describe, expect, it } from "vitest";
import { normalizeUnreadCount } from "./unread-count";

describe("normalizeUnreadCount", () => {
  it("normalizes missing, invalid, fractional, and negative values", () => {
    expect(normalizeUnreadCount(undefined)).toBe(0);
    expect(normalizeUnreadCount(null)).toBe(0);
    expect(normalizeUnreadCount(Number.NaN)).toBe(0);
    expect(normalizeUnreadCount(-4)).toBe(0);
    expect(normalizeUnreadCount(3.9)).toBe(3);
  });
});
