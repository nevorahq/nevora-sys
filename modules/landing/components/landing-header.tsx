import Link from "next/link";
import { TimerIcon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import type { PublicLocale } from "@/shared/i18n/constants";
import { ThemeToggle } from "@/shared/ui/theme-toggle";
import { BRAND, type LandingContent } from "../constants/landing-content";
import { LandingAppMenu } from "./landing-app-menu";
import { LandingLanguageMenu } from "./landing-language-menu";
import { LandingMobileNav } from "./landing-mobile-nav";

interface LandingHeaderProps {
  nav: LandingContent["nav"];
  header: LandingContent["header"];
  locale: PublicLocale;
}

/**
 * Sticky-хедер лендинга. Server Component: anchor-навигация обычная,
 * интерактивные острова — меню приложений, language menu, ThemeToggle и mobile nav.
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
          <span className="hidden text-sm sm:inline sm:text-base">{BRAND}</span>
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

        <div className="flex items-center justify-end gap-1.5 sm:gap-2">
          <LandingAppMenu locale={locale} />
          <LandingLanguageMenu locale={locale} />
          <ThemeToggle className="h-11 w-11 sm:h-9 sm:w-9" />
          <Link
            href={ROUTES.register}
            aria-label={header.cta}
            title={header.cta}
            className="soft-focus inline-flex h-11 w-11 items-center justify-center rounded-(--neu-radius-pill) bg-text-primary text-text-inverse shadow-neu-control transition-shadow hover:shadow-neu-card active:shadow-neu-inset sm:h-9 sm:w-9"
          >
            <TimerIcon size={18} strokeWidth={1.9} aria-hidden="true" />
          </Link>
          <LandingMobileNav
            nav={nav}
            menuLabel={header.menu}
            closeLabel={header.close}
          />
        </div>
      </div>
    </header>
  );
}
