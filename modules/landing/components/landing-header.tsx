import Link from "next/link";
import { ROUTES } from "@/shared/config/routes";
import type { PublicLocale } from "@/shared/i18n/constants";
import { ThemeToggle } from "@/shared/ui/theme-toggle";
import { BRAND, type LandingContent } from "../constants/landing-content";
import { LandingLanguageMenu } from "./landing-language-menu";
import { LandingMobileNav } from "./landing-mobile-nav";

interface LandingHeaderProps {
  nav: LandingContent["nav"];
  header: LandingContent["header"];
  locale: PublicLocale;
}

/**
 * Sticky-хедер лендинга. Server Component: anchor-навигация обычная,
 * интерактивные острова — language menu, ThemeToggle и мобильное меню.
 * Бренд виден на всех размерах; на мобильных полноценное выпадающее меню.
 */
export function LandingHeader({ nav, header, locale }: LandingHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border-soft bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="#home"
          className="soft-focus flex items-center gap-2 rounded-(--neu-radius-md) font-semibold tracking-tight text-text-primary"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-(--neu-radius-md) bg-text-primary text-sm font-bold text-text-inverse shadow-neu-control">
            N
          </span>
          <span className="text-sm sm:text-base">{BRAND}</span>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Primary">
          {nav.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="soft-focus rounded-(--neu-radius-pill) px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center justify-end gap-2">
          <LandingLanguageMenu locale={locale} />
          <ThemeToggle />
          <Link
            href={ROUTES.login}
            className="soft-focus hidden rounded-(--neu-radius-pill) px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary md:inline-flex"
          >
            {header.login}
          </Link>
          <Link
            href={ROUTES.register}
            className="soft-focus hidden h-9 items-center justify-center rounded-(--neu-radius-pill) bg-text-primary px-4 text-sm font-semibold text-text-inverse shadow-neu-control transition-shadow hover:shadow-neu-card active:shadow-neu-inset md:inline-flex"
          >
            {header.cta}
          </Link>
          <LandingMobileNav
            nav={nav}
            header={header}
            menuLabel={header.menu}
            closeLabel={header.close}
          />
        </div>
      </div>
    </header>
  );
}
