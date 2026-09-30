"use client";

import { Button } from "@/shared/ui/button";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { openConsentPreferences } from "../cookie-consent";

/** Settings entry point for changing the analytics-cookie choice inside the app. */
export function CookiePreferencesCard({ t }: { t: Dictionary["cookieConsent"] }) {
  return (
    <section className="soft-card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-base font-semibold text-text-primary">{t.settingsTitle}</h2>
        <p className="mt-1 text-sm text-text-muted">{t.settingsDescription}</p>
      </div>
      <Button type="button" variant="secondary" onClick={openConsentPreferences}>
        {t.settings}
      </Button>
    </section>
  );
}
