"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CheckIcon, GlobeIcon } from "lucide-react";
import { setLocaleAction } from "@/shared/i18n/set-locale.action";
import { LOCALES, PUBLIC_LOCALE_NAMES, type Locale } from "@/shared/i18n/constants";
import { cn } from "@/shared/utils/cn";

interface LanguageSwitcherProps {
  locale: Locale;
  className?: string;
}

/**
 * Переключатель языка приложения (en/ru/ro). Показывает АКТИВНЫЙ язык полным
 * названием (раньше показывал язык назначения), в меню текущий отмечен галочкой.
 * Список берётся из `LOCALES`, поэтому румынский появляется автоматически после
 * добавления словаря `dictionaries/ro.ts`.
 */
export function LanguageSwitcher({ locale, className }: LanguageSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  function select(next: Locale) {
    setIsOpen(false);
    if (next === locale) return;
    startTransition(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  }

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Language: ${PUBLIC_LOCALE_NAMES[locale]}`}
        disabled={isPending}
        onClick={() => setIsOpen((value) => !value)}
        className="soft-icon-button h-9 min-w-9 gap-1.5 rounded-(--neu-radius-pill) px-3 text-sm font-medium disabled:opacity-60"
      >
        <GlobeIcon size={16} strokeWidth={1.9} aria-hidden="true" />
        <span>{PUBLIC_LOCALE_NAMES[locale]}</span>
      </button>

      {isOpen && (
        <ul
          role="menu"
          aria-label="Language"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 flex min-w-36 flex-col overflow-hidden rounded-(--neu-radius-md) border border-border-soft bg-surface-elevated p-1 shadow-neu-card"
        >
          {LOCALES.map((item) => {
            const isActive = item === locale;
            return (
              <li key={item} role="none">
                <button
                  type="button"
                  role="menuitem"
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => select(item)}
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
