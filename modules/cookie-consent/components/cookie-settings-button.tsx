"use client";

import { cn } from "@/shared/utils/cn";
import { openConsentPreferences } from "../cookie-consent";

/**
 * Reopens the cookie-consent banner. A plain text control so it sits in a
 * footer or a settings card next to ordinary links without a floating widget
 * competing with the sidebar and the toasts.
 */
export function CookieSettingsButton({ label, className }: { label: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={openConsentPreferences}
      className={cn("soft-focus w-fit text-left transition-colors hover:text-text-primary", className)}
    >
      {label}
    </button>
  );
}
