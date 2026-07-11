import { afterEach, describe, expect, it, vi } from "vitest";

const after = vi.fn();
vi.mock("next/server", () => ({ after: (cb: () => unknown) => after(cb) }));

const flush = vi.fn().mockResolvedValue(true);
vi.mock("./monitoring", () => ({ getMonitoring: () => ({ flush }) }));

const { flushMonitoringAfterResponse } = await import("./flush-after-response");

afterEach(() => vi.clearAllMocks());

describe("flushMonitoringAfterResponse", () => {
  it("schedules the flush via after() so the response is not blocked", () => {
    flushMonitoringAfterResponse(1234);

    expect(after).toHaveBeenCalledTimes(1);
    // after() gets a callback; running it triggers the flush with our timeout.
    const scheduled = after.mock.calls[0][0] as () => unknown;
    scheduled();
    expect(flush).toHaveBeenCalledWith(1234);
  });

  it("falls back to a fire-and-forget flush when after() is outside a request scope", () => {
    after.mockImplementationOnce(() => {
      throw new Error("after() was called outside a request scope");
    });

    expect(() => flushMonitoringAfterResponse()).not.toThrow();
    expect(flush).toHaveBeenCalledWith(2000);
  });
});
