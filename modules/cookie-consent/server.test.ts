import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined, throws: false }));
const scheduled = vi.hoisted(() => [] as Array<() => Promise<void>>);

vi.mock("next/headers", () => ({
  cookies: async () => {
    if (cookieJar.throws) throw new Error("outside a request scope");
    return { get: () => (cookieJar.value === undefined ? undefined : { value: cookieJar.value }) };
  },
}));

vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => {
    scheduled.push(callback);
  },
}));

import { serializeConsent } from "./cookie-consent";
import { trackServerEvent } from "./server";

const fetchMock = vi.fn();

async function runScheduled() {
  for (const callback of scheduled.splice(0)) await callback();
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
  cookieJar.value = serializeConsent({ analytics: true, updatedAt: "2026-10-01T00:00:00.000Z" });
  cookieJar.throws = false;
  scheduled.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("trackServerEvent", () => {
  it("sends the event to PostHog EU after the response, keyed by the user id", async () => {
    await trackServerEvent("user-123", "task_created", { organization_id: "org-1", priority: "high" });
    expect(fetchMock).not.toHaveBeenCalled();

    await runScheduled();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://eu.i.posthog.com/i/v0/e/");
    expect(JSON.parse(init.body)).toMatchObject({
      api_key: "phc_test",
      event: "task_created",
      distinct_id: "user-123",
      properties: { organization_id: "org-1", priority: "high", $lib: "nevora-server" },
    });
  });

  it("ignores the browser reverse-proxy host", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://t.example.com");
    await trackServerEvent("user-123", "user_signed_up");
    await runScheduled();

    expect(fetchMock.mock.calls[0][0]).toBe("https://eu.i.posthog.com/i/v0/e/");
  });

  it.each([
    ["declined", serializeConsent({ analytics: false, updatedAt: "2026-10-01T00:00:00.000Z" })],
    ["not answered", undefined],
    ["unreadable", "not-json"],
  ])("sends nothing when consent is %s", async (_label, value) => {
    cookieJar.value = value;
    await trackServerEvent("user-123", "task_created");
    await runScheduled();

    expect(scheduled).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing without a project key", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    await trackServerEvent("user-123", "task_created");
    await runScheduled();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing outside a request scope", async () => {
    cookieJar.throws = true;
    await expect(trackServerEvent("user-123", "task_created")).resolves.toBeUndefined();
    await runScheduled();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows network failures", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await trackServerEvent("user-123", "task_created");

    await expect(runScheduled()).resolves.toBeUndefined();
  });
});
