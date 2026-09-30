// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { CookieConsentBanner, type CookieConsentLabels } from "./cookie-consent-banner";
import { clearConsent, loadConsent, openConsentPreferences, saveConsent } from "../cookie-consent";
import { en } from "@/shared/i18n/dictionaries/en";
import { ru } from "@/shared/i18n/dictionaries/ru";
import { ro } from "@/shared/i18n/dictionaries/ro";

const labels: CookieConsentLabels = {
  en: en.cookieConsent,
  ru: ru.cookieConsent,
  ro: ro.cookieConsent,
};

afterEach(() => {
  cleanup();
  clearConsent();
  document.documentElement.lang = "";
});

describe("CookieConsentBanner", () => {
  it("asks a first-time visitor and records a decline", () => {
    render(<CookieConsentBanner locale="en" labels={labels} />);

    const region = screen.getByRole("region", { name: "Cookie consent" });
    expect(region.textContent).toContain("We use cookies");

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));

    expect(loadConsent()?.analytics).toBe(false);
    expect(screen.queryByRole("region", { name: "Cookie consent" })).toBeNull();
  });

  it("records an acceptance", () => {
    render(<CookieConsentBanner locale="en" labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(loadConsent()?.analytics).toBe(true);
  });

  it("stays hidden once answered, and comes back from Cookie settings", () => {
    saveConsent(true);
    render(<CookieConsentBanner locale="en" labels={labels} />);
    expect(screen.queryByRole("region")).toBeNull();

    act(() => openConsentPreferences());
    expect(screen.getByRole("region", { name: "Cookie consent" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(loadConsent()?.analytics).toBe(false);
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("follows <html lang> over the server's cookie locale", () => {
    document.documentElement.lang = "ru";
    render(<CookieConsentBanner locale="en" labels={labels} />);

    expect(screen.getByRole("region", { name: ru.cookieConsent.regionLabel })).toBeDefined();
    expect(screen.getByRole("link", { name: ru.cookieConsent.privacyLink }).getAttribute("href")).toBe(
      "/privacy?lang=ru",
    );
  });

  it("switches language when <html lang> changes under it", async () => {
    document.documentElement.lang = "en";
    render(<CookieConsentBanner locale="en" labels={labels} />);

    await act(async () => {
      document.documentElement.lang = "ro";
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: ro.cookieConsent.accept })).toBeDefined();
  });
});
