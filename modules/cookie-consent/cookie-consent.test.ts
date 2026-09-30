// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONSENT_COOKIE,
  clearConsent,
  hasRespondedToConsent,
  loadConsent,
  openConsentPreferences,
  parseConsent,
  saveConsent,
  serializeConsent,
  subscribeToConsent,
  subscribeToConsentPreferences,
} from "./cookie-consent";

afterEach(() => {
  clearConsent();
});

describe("parseConsent", () => {
  it("round-trips a serialized state", () => {
    const state = { analytics: true, updatedAt: "2026-09-30T10:00:00.000Z" };
    expect(parseConsent(serializeConsent(state))).toEqual(state);
  });

  it.each([
    ["empty", ""],
    ["null", null],
    ["not JSON", "garbage"],
    ["JSON null", encodeURIComponent("null")],
    ["non-boolean analytics", encodeURIComponent(JSON.stringify({ analytics: "yes", updatedAt: "2026-09-30" }))],
    ["missing updatedAt", encodeURIComponent(JSON.stringify({ analytics: true }))],
    ["invalid date", encodeURIComponent(JSON.stringify({ analytics: true, updatedAt: "not a date" }))],
  ])("rejects %s", (_label, raw) => {
    expect(parseConsent(raw)).toBeNull();
  });
});

describe("consent cookie", () => {
  it("starts unanswered", () => {
    expect(loadConsent()).toBeNull();
    expect(hasRespondedToConsent()).toBe(false);
  });

  it("persists the choice under the nevora cookie and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToConsent(listener);

    saveConsent(true);

    expect(document.cookie).toContain(`${CONSENT_COOKIE}=`);
    expect(loadConsent()?.analytics).toBe(true);
    expect(hasRespondedToConsent()).toBe(true);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ analytics: true }));

    unsubscribe();
    saveConsent(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(loadConsent()?.analytics).toBe(false);
  });

  it("clearing forgets the choice", () => {
    saveConsent(true);
    clearConsent();
    expect(hasRespondedToConsent()).toBe(false);
  });
});

describe("openConsentPreferences", () => {
  it("reaches every subscribed control until it unsubscribes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToConsentPreferences(listener);

    openConsentPreferences();
    unsubscribe();
    openConsentPreferences();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
