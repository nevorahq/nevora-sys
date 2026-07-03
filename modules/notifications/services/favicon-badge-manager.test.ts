import { describe, expect, it } from "vitest";
import { faviconMarkerState } from "./favicon-badge-manager";

describe("favicon marker state", () => {
  it("badges only positive unread counts", () => {
    expect(faviconMarkerState(0)).toBe("default");
    expect(faviconMarkerState(-1)).toBe("default");
    expect(faviconMarkerState(Number.NaN)).toBe("default");
    expect(faviconMarkerState(1)).toBe("badged");
  });
});
