import { afterEach, describe, expect, it, vi } from "vitest";

const { flushMonitoringAfterResponse } = vi.hoisted(() => ({ flushMonitoringAfterResponse: vi.fn() }));
vi.mock("./flush-after-response", () => ({ flushMonitoringAfterResponse }));

import { getMonitoring, setMonitoringSink } from "./monitoring";
import { reportError } from "./report-error";

afterEach(() => {
  setMonitoringSink(null);
  vi.restoreAllMocks();
});

describe("reportError → monitoring seam", () => {
  it("returns a diagnosticId and a user-safe message, never the raw error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const raw = new Error("connection string leaked here");
    const { diagnosticId, message } = reportError("documents.upload.failed", raw, {
      userMessage: "We could not finish the upload. Please try again.",
    });

    expect(diagnosticId).toMatch(/\w+-\w+/);
    expect(message).toBe("We could not finish the upload. Please try again.");
    expect(message).not.toContain("connection string leaked here");
  });

  it("forwards the caught error to the monitoring sink with event + diagnosticId + fields", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const captureException = vi.fn();
    setMonitoringSink({ captureException, captureMessage: vi.fn() });

    const raw = new Error("kaboom");
    const { diagnosticId } = reportError("billing.reserve.failed", raw, {
      fields: { organizationId: "org_123" },
    });

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(raw, {
      event: "billing.reserve.failed",
      diagnosticId,
      fields: { organizationId: "org_123" },
    });
  });

  it("schedules a post-response flush so serverless does not drop the event", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    flushMonitoringAfterResponse.mockClear();
    setMonitoringSink({ captureException: vi.fn(), captureMessage: vi.fn() });

    reportError("documents.upload.failed", new Error("kaboom"));

    expect(flushMonitoringAfterResponse).toHaveBeenCalledTimes(1);
  });

  it("still returns a safe payload even if the monitoring provider throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setMonitoringSink({
      captureException() {
        throw new Error("provider down");
      },
      captureMessage: vi.fn(),
    });

    expect(() => reportError("x.failed", new Error("y"))).not.toThrow();
    // Sanity: the seam is the guarded one, so the throw was swallowed upstream.
    expect(() => getMonitoring().captureException(new Error("z"))).not.toThrow();
  });
});
