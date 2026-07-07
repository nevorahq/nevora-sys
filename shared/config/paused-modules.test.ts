import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound }));

const { assertPausedModuleEnabled, isPausedModuleEnabled } = await import("./paused-modules");

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEVORA_ENABLE_CRM;
  delete process.env.NEVORA_ENABLE_BOOKING;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("paused modules guard", () => {
  it("blocks CRM by default (private beta)", () => {
    expect(isPausedModuleEnabled("crm")).toBe(false);
    expect(() => assertPausedModuleEnabled("crm")).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("blocks Booking by default (private beta)", () => {
    expect(isPausedModuleEnabled("booking")).toBe(false);
    expect(() => assertPausedModuleEnabled("booking")).toThrow("NEXT_NOT_FOUND");
  });

  it("allows a paused module only when its flag is explicitly enabled", () => {
    process.env.NEVORA_ENABLE_CRM = "true";
    expect(isPausedModuleEnabled("crm")).toBe(true);
    expect(() => assertPausedModuleEnabled("crm")).not.toThrow();
    expect(notFound).not.toHaveBeenCalled();
    // The other paused module stays blocked.
    expect(() => assertPausedModuleEnabled("booking")).toThrow("NEXT_NOT_FOUND");
  });
});
