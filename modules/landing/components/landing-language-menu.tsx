"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CheckIcon, GlobeIcon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import { setLocaleAction } from "@/shared/i18n/set-locale.action";
import { PUBLIC_LOCALES, PUBLIC_LOCALE_NAMES, type PublicLocale } from "@/shared/i18n/constants";
import { cn } from "@/shared/utils/cn";

interface LandingLanguageMenuProps {
  locale: PublicLocale;
}

const localeHref: Record<PublicLocale, string> = {
  en: ROUTES.landingEn,
  ro: ROUTES.landingRo,
  ru: ROUTES.landingRu,
};

/**
 * Языковое меню лендинга. Показывает АКТИВНЫЙ язык полным названием и, при выборе,
 * не только навигирует на локальный лендинг, но и ставит cookie публичной локали
 * (`setLocaleAction`) — чтобы переходы на login/register/legal сохраняли язык.
 */
export function LandingLanguageMenu({ locale }: LandingLanguageMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
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

  function selectLocale(next: PublicLocale) {
    setIsOpen(false);
    if (next === locale) return;
    startTransition(async () => {
      await setLocaleAction(next);
      router.push(localeHref[next]);
      router.refresh();
    });
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Language: ${PUBLIC_LOCALE_NAMES[locale]}`}
        disabled={isPending}
        onClick={() => setIsOpen((value) => !value)}
        className={cn(
          "soft-focus inline-flex h-11 min-w-11 cursor-pointer items-center gap-1.5 rounded-(--neu-radius-pill) border border-border-soft bg-surface px-3 text-sm font-medium text-text-secondary shadow-neu-control transition-colors hover:text-text-primary disabled:opacity-60 sm:h-9",
          isOpen && "border-border-strong text-text-primary",
        )}
      >
        <GlobeIcon size={16} strokeWidth={1.9} aria-hidden="true" />
        <span>{PUBLIC_LOCALE_NAMES[locale]}</span>
      </button>

      {isOpen && (
        <ul
          role="menu"
          aria-label="Language"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 flex min-w-40 flex-col overflow-hidden rounded-(--neu-radius-md) border border-border-soft bg-surface-elevated p-1 shadow-neu-card"
        >
          {PUBLIC_LOCALES.map((item) => {
            const isActive = item === locale;
            return (
              <li key={item} role="none">
                <button
                  type="button"
                  role="menuitem"
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => selectLocale(item)}
                  className={cn(
                    "soft-focus flex w-full items-center justify-between gap-3 rounded-(--neu-radius-sm) px-3 py-2.5 text-left text-sm transition-colors",
                    isActive
                      ? "font-semibold text-text-primary"
                      : "text-text-secondary hover:bg-surface hover:text-text-primary",
                  )}
                >
                  <span>{PUBLIC_LOCALE_NAMES[item]}</span>
                  {isActive && <CheckIcon size={16} strokeWidth={2.2} aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
