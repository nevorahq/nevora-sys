import { describe, expect, it } from "vitest";
import { isPermanentPushFailure } from "./notification-delivery";

describe("push subscription cleanup", () => {
  it("classifies expired endpoints as permanent failures", () => {
    expect(isPermanentPushFailure(404)).toBe(true);
    expect(isPermanentPushFailure(410)).toBe(true);
    expect(isPermanentPushFailure(429)).toBe(false);
    expect(isPermanentPushFailure(503)).toBe(false);
  });
});
