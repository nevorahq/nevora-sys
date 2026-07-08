import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({ notFound }));

// The guard's job is the *decision* (paused → 404), not Next's Response plumbing.
// Stub NextResponse so this stays a pure unit test with no Next runtime.
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status }),
  },
}));

const {
  assertPausedModuleEnabled,
  assertPausedModuleAction,
  pausedModuleGuard,
  isPausedModuleEnabled,
  PausedModuleError,
} = await import("./paused-modules");

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEVORA_ENABLE_CRM;
  delete process.env.NEVORA_ENABLE_BOOKING;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("paused modules guard — pages", () => {
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

describe("paused modules guard — Server Actions", () => {
  // A `"use server"` export stays reachable over POST even when every page that
  // renders its form 404s. Gating the page is therefore NOT enough: without this
  // guard a paused module remains a live mutation surface for any org member.
  it("rejects a paused module's Server Action by default", () => {
    expect(() => assertPausedModuleAction("crm")).toThrow(PausedModuleError);
    expect(() => assertPausedModuleAction("booking")).toThrow(PausedModuleError);
  });

  it("throws before any mutation, carrying the module name", () => {
    try {
      assertPausedModuleAction("booking");
      throw new Error("expected assertPausedModuleAction to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(PausedModuleError);
      expect((err as InstanceType<typeof PausedModuleError>).module).toBe("booking");
    }
  });

  it("does not call notFound() — a POST has no route segment to terminate", () => {
    expect(() => assertPausedModuleAction("crm")).toThrow();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("allows the action once the module's flag is enabled", () => {
    process.env.NEVORA_ENABLE_BOOKING = "1";
    expect(() => assertPausedModuleAction("booking")).not.toThrow();
    expect(() => assertPausedModuleAction("crm")).toThrow(PausedModuleError);
  });
});

describe("paused modules guard — Route Handlers", () => {
  it("returns 404 (not 403) so a paused module looks undeployed", () => {
    const res = pausedModuleGuard("booking");
    expect(res).not.toBeNull();
    expect(res).toMatchObject({ status: 404, body: { error: "not_found" } });
  });

  it("returns null so the handler proceeds when the module is enabled", () => {
    process.env.NEVORA_ENABLE_BOOKING = "true";
    expect(pausedModuleGuard("booking")).toBeNull();
    // CRM has no route handlers today, but the guard must stay independent.
    expect(pausedModuleGuard("crm")).not.toBeNull();
  });
});
