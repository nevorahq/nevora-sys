// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: posthog }));

const config = { key: "phc_test", host: "https://eu.i.posthog.com", uiHost: "https://eu.posthog.com" };

// `PostHogProvider` keeps the SDK load in module state, so every test gets
// fresh copies of it and of the consent store it subscribes to.
async function loadModules() {
  vi.resetModules();
  const consent = await import("../cookie-consent");
  const { PostHogProvider } = await import("./posthog-provider");
  return { consent, PostHogProvider };
}

/** Lets the dynamic `import("posthog-js")` and its `.then` chain settle. */
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  cleanup();
  (await import("../cookie-consent")).clearConsent();
});

describe("PostHogProvider", () => {
  it("never loads the SDK without a project key", async () => {
    const { consent, PostHogProvider } = await loadModules();
    consent.saveConsent(true);

    render(<PostHogProvider config={null} />);
    await settle();

    expect(posthog.init).not.toHaveBeenCalled();
  });

  it("does not load the SDK before the visitor answers, or after a decline", async () => {
    const { consent, PostHogProvider } = await loadModules();
    render(<PostHogProvider config={config} />);
    await settle();
    expect(posthog.init).not.toHaveBeenCalled();

    consent.saveConsent(false);
    await settle();

    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.opt_out_capturing).not.toHaveBeenCalled();
  });

  it("loads with no storage, no replay and no element text, then opts in", async () => {
    const { consent, PostHogProvider } = await loadModules();
    render(<PostHogProvider config={config} />);

    consent.saveConsent(true);
    await settle();

    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        api_host: config.host,
        ui_host: config.uiHost,
        opt_out_capturing_by_default: true,
        opt_out_persistence_by_default: true,
        disable_session_recording: true,
        mask_all_text: true,
        capture_performance: { web_vitals: true },
      }),
    );
    expect(posthog.opt_in_capturing).toHaveBeenCalledTimes(1);
  });

  it("opts in on load for a returning visitor who already accepted", async () => {
    const { consent, PostHogProvider } = await loadModules();
    consent.saveConsent(true);

    render(<PostHogProvider config={config} />);
    await settle();

    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.opt_in_capturing).toHaveBeenCalledTimes(1);
  });

  it("opts back out when an earlier acceptance is withdrawn", async () => {
    const { consent, PostHogProvider } = await loadModules();
    render(<PostHogProvider config={config} />);

    consent.saveConsent(true);
    consent.saveConsent(false);
    await settle();

    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.opt_in_capturing).toHaveBeenCalledTimes(1);
    expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(1);
    expect(posthog.opt_out_capturing.mock.invocationCallOrder[0]).toBeGreaterThan(
      posthog.opt_in_capturing.mock.invocationCallOrder[0],
    );
  });
});
