import { describe, expect, it } from "vitest";
import { shouldApplyUnreadCountResponse } from "./fetch-unread-notification-count";

describe("unread count request ordering", () => {
  it("accepts only the latest response while the provider is active", () => {
    expect(shouldApplyUnreadCountResponse(2, 2, true)).toBe(true);
    expect(shouldApplyUnreadCountResponse(1, 2, true)).toBe(false);
    expect(shouldApplyUnreadCountResponse(2, 2, false)).toBe(false);
  });
});
