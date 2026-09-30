import { afterEach, describe, expect, it, vi } from "vitest";

import { POSTHOG_EU_INGEST_HOST, POSTHOG_EU_UI_HOST, getPostHogConfig } from "./posthog-config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getPostHogConfig", () => {
  it("is off without a project key", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    expect(getPostHogConfig()).toBeNull();

    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "   ");
    expect(getPostHogConfig()).toBeNull();
  });

  it("defaults both hosts to PostHog's EU region", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_UI_HOST", "");

    expect(getPostHogConfig()).toEqual({
      key: "phc_test",
      host: POSTHOG_EU_INGEST_HOST,
      uiHost: POSTHOG_EU_UI_HOST,
    });
  });

  it("uses a reverse-proxy host when one is set", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", " phc_test ");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://e.example.com");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_UI_HOST", "https://eu.posthog.com");

    expect(getPostHogConfig()).toEqual({
      key: "phc_test",
      host: "https://e.example.com",
      uiHost: "https://eu.posthog.com",
    });
  });
});
