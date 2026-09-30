"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";

import { Button } from "@/shared/ui/button";
import { ROUTES } from "@/shared/config/routes";
import { isValidPublicLocale, type PublicLocale } from "@/shared/i18n/constants";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import {
  hasRespondedToConsent,
  saveConsent,
  subscribeToConsent,
  subscribeToConsentPreferences,
} from "../cookie-consent";

export type CookieConsentLabels = Record<PublicLocale, Dictionary["cookieConsent"]>;

interface CookieConsentBannerProps {
  /** Locale the server rendered `<html lang>` with — the fallback until the document says otherwise. */
  locale: PublicLocale;
  /** All three slices: the banner follows `<html lang>`, which `/en` `/ru` `/ro` correct on the client. */
  labels: CookieConsentLabels;
}

// Server snapshot: treat the visitor as having answered, so the banner never
// renders into the HTML and only appears after hydration reads the cookie.
function getServerSnapshot() {
  return true;
}

function subscribeToDocumentLang(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  return () => observer.disconnect();
}

function readDocumentLang() {
  return document.documentElement.lang;
}

/**
 * Opt-in by default. Nothing here calls PostHog (see `PostHogProvider`, which
 * reacts to the same cookie), so the banner and the SDK stay decoupled.
 *
 * The landing entries `/en` `/ru` `/ro` set `<html lang>` on the client
 * (`HtmlLangSync`) when the locale cookie disagrees with the URL — the usual
 * case on a first visit — so the banner reads the language from the document
 * rather than from the server's cookie-based guess.
 */
export function CookieConsentBanner({ locale, labels }: CookieConsentBannerProps) {
  const hasResponded = useSyncExternalStore(subscribeToConsent, hasRespondedToConsent, getServerSnapshot);
  const documentLang = useSyncExternalStore(subscribeToDocumentLang, readDocumentLang, () => locale);
  const [reopened, setReopened] = useState(false);

  useEffect(() => subscribeToConsentPreferences(() => setReopened(true)), []);

  const respond = useCallback((analytics: boolean) => {
    saveConsent(analytics);
    setReopened(false);
  }, []);

  if (hasResponded && !reopened) return null;

  const activeLocale = isValidPublicLocale(documentLang) ? documentLang : locale;
  const t = labels[activeLocale];

  return (
    <section
      role="region"
      aria-label={t.regionLabel}
      lang={activeLocale}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-(--neu-radius-md) border border-border-soft bg-surface p-4 shadow-neu-card sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-text-primary">{t.title}</h2>
          <p className="text-sm leading-relaxed text-text-secondary">
            {t.description}{" "}
            <Link
              href={`${ROUTES.privacy}?lang=${activeLocale}`}
              className="soft-focus underline underline-offset-2 transition-colors hover:text-text-primary"
            >
              {t.privacyLink}
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={() => respond(false)}>
            {t.decline}
          </Button>
          <Button type="button" className="flex-1 sm:flex-none" onClick={() => respond(true)}>
            {t.accept}
          </Button>
        </div>
      </div>
    </section>
  );
}
