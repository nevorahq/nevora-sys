import Link from "next/link";
import { ROUTES } from "@/shared/config/routes";
import type { Locale } from "@/shared/i18n/constants";
import { ThemeToggle } from "@/shared/ui/theme-toggle";
import { LanguageSwitcher } from "@/shared/ui/language-switcher";
import { BRAND, type LandingContent } from "../constants/landing-content";

interface LandingHeaderProps {
  nav: LandingContent["nav"];
  header: LandingContent["header"];
  locale: Locale;
}

/**
 * Sticky-хедер лендинга. Server Component: anchor-навигация — обычные <a>,
 * интерактивные острова — ThemeToggle и LanguageSwitcher (оба client).
 * На мобильных nav-ссылки скрыты, остаётся бренд + переключатели + CTA.
 */
export function LandingHeader({ nav, header, locale }: LandingHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border-soft bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="#home"
          className="flex items-center gap-2 font-semibold tracking-tight text-text-primary"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-(--neu-radius-md) bg-text-primary text-sm font-bold text-text-inverse shadow-neu-control">
            N
          </span>
          <span className="text-sm sm:text-base">{BRAND}</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {nav.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-(--neu-radius-pill) px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher locale={locale} />
          <ThemeToggle />
          <Link
            href={ROUTES.login}
            className="hidden rounded-(--neu-radius-pill) px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary sm:inline-flex"
          >
            {header.login}
          </Link>
          <Link
            href={ROUTES.register}
            className="inline-flex items-center justify-center rounded-(--neu-radius-pill) bg-text-primary px-4 py-2 text-sm font-semibold text-text-inverse shadow-neu-control transition-all hover:shadow-neu-card active:scale-[0.98] active:shadow-neu-inset"
          >
            {header.startFree}
          </Link>
        </div>
      </div>
    </header>
  );
}
