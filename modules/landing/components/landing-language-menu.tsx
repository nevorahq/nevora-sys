"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ROUTES } from "@/shared/config/routes";
import { cn } from "@/shared/utils/cn";
import {
  LANDING_LOCALE_LABELS,
  LANDING_LOCALES,
  type LandingLocale,
} from "../constants/landing-content";

interface LandingLanguageMenuProps {
  locale: LandingLocale;
}

const localeHref: Record<LandingLocale, string> = {
  en: ROUTES.landingEn,
  ro: ROUTES.landingRo,
  ru: ROUTES.landingRu,
};

function orderedLocales(locale: LandingLocale) {
  const activeIndex = LANDING_LOCALES.indexOf(locale);
  return [
    ...LANDING_LOCALES.slice(activeIndex),
    ...LANDING_LOCALES.slice(0, activeIndex),
  ];
}

export function LandingLanguageMenu({ locale }: LandingLanguageMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => orderedLocales(locale), [locale]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Select landing language"
        onClick={() => setIsOpen((value) => !value)}
        className={cn(
          "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-(--neu-radius-pill) border border-border-soft bg-surface text-xs font-semibold uppercase text-text-secondary shadow-neu-control transition-colors hover:text-text-primary",
          isOpen && "border-text-primary text-text-primary",
        )}
      >
        {LANDING_LOCALE_LABELS[locale]}
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="Landing language"
          className="absolute right-0 top-0 z-50 flex w-9 flex-col overflow-hidden rounded-(--neu-radius-pill) border border-border-soft bg-surface shadow-neu-card"
        >
          {items.map((item) => {
            const isActive = item === locale;
            const className = cn(
              "flex h-9 w-9 items-center justify-center text-xs font-semibold uppercase transition-colors",
              isActive
                ? "bg-text-primary text-text-inverse"
                : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
            );

            if (isActive) {
              return (
                <span
                  key={item}
                  role="menuitem"
                  aria-current="true"
                  aria-disabled="true"
                  className={className}
                >
                  {LANDING_LOCALE_LABELS[item]}
                </span>
              );
            }

            return (
              <Link
                key={item}
                href={localeHref[item]}
                role="menuitem"
                className={className}
                onClick={() => setIsOpen(false)}
              >
                {LANDING_LOCALE_LABELS[item]}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
