import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getMonitoring,
  isMonitoringConfigured,
  setMonitoringSink,
  type MonitoringSink,
} from "./monitoring";

afterEach(() => {
  // Restore the default no-op sink so tests don't leak an installed provider.
  setMonitoringSink(null);
  vi.unstubAllEnvs();
});

describe("monitoring seam", () => {
  it("defaults to a no-op sink that never throws and returns nothing", () => {
    const m = getMonitoring();
    expect(m.captureException(new Error("boom"), { event: "x" })).toBeUndefined();
    expect(m.captureMessage("hi", "warning")).toBeUndefined();
  });

  it("forwards to an installed sink with the exact error and context", () => {
    const captureException = vi.fn();
    const captureMessage = vi.fn();
    setMonitoringSink({ captureException, captureMessage });

    const err = new Error("kaboom");
    getMonitoring().captureException(err, { event: "documents.upload.failed", diagnosticId: "abc" });
    getMonitoring().captureMessage("drift", "error", { event: "billing.release.failed" });

    expect(captureException).toHaveBeenCalledWith(err, {
      event: "documents.upload.failed",
      diagnosticId: "abc",
    });
    expect(captureMessage).toHaveBeenCalledWith("drift", "error", {
      event: "billing.release.failed",
    });
  });

  it("swallows a throwing provider so monitoring can never break the caller", () => {
    const throwing: MonitoringSink = {
      captureException() {
        throw new Error("provider down");
      },
      captureMessage() {
        throw new Error("provider down");
      },
    };
    setMonitoringSink(throwing);

    expect(() => getMonitoring().captureException(new Error("x"))).not.toThrow();
    expect(() => getMonitoring().captureMessage("x", "fatal")).not.toThrow();
  });

  it("setMonitoringSink(null) restores the no-op sink", () => {
    const captureException = vi.fn();
    setMonitoringSink({ captureException, captureMessage: vi.fn() });
    setMonitoringSink(null);

    getMonitoring().captureException(new Error("x"));
    expect(captureException).not.toHaveBeenCalled();
  });

  describe("isMonitoringConfigured", () => {
    it("is false when no DSN env is set", () => {
      vi.stubEnv("SENTRY_DSN", "");
      vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
      expect(isMonitoringConfigured()).toBe(false);
    });

    it("is true when the server DSN is set", () => {
      vi.stubEnv("SENTRY_DSN", "https://key@example.ingest.sentry.io/1");
      expect(isMonitoringConfigured()).toBe(true);
    });

    it("is true when only the public (client) DSN is set", () => {
      vi.stubEnv("SENTRY_DSN", "");
      vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@example.ingest.sentry.io/2");
      expect(isMonitoringConfigured()).toBe(true);
    });
  });
});
