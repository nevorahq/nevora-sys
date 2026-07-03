import { describe, expect, it, vi } from "vitest";
import { safeNotificationTarget, urlBase64ToUint8Array } from "./browser-notifications";

vi.stubGlobal("atob", (value: string) => Buffer.from(value, "base64").toString("binary"));

describe("browser notification helpers", () => {
  it("converts a VAPID URL-safe base64 key", () => {
    expect(Array.from(urlBase64ToUint8Array("AQIDBA"))).toEqual([1, 2, 3, 4]);
  });

  it("falls back for missing, external, and protocol-relative targets", () => {
    expect(safeNotificationTarget("/dashboard/tasks/123")).toBe("/dashboard/tasks/123");
    expect(safeNotificationTarget("https://evil.example")).toBe("/dashboard/actions");
    expect(safeNotificationTarget("//evil.example")).toBe("/dashboard/actions");
    expect(safeNotificationTarget(null)).toBe("/dashboard/actions");
  });
});
