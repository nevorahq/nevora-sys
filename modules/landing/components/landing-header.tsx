import Link from "next/link";
import { KeyRoundIcon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import { ThemeToggle } from "@/shared/ui/theme-toggle";
import {
  BRAND,
  type LandingContent,
  type LandingLocale,
} from "../constants/landing-content";
import { LandingLanguageMenu } from "./landing-language-menu";

interface LandingHeaderProps {
  nav: LandingContent["nav"];
  header: LandingContent["header"];
  locale: LandingLocale;
}

/**
 * Sticky-хедер лендинга. Server Component: anchor-навигация обычная,
 * интерактивные острова — language menu и ThemeToggle.
 * На мобильных nav-ссылки скрыты, остаётся знак бренда + переключатели + CTA.
 */
export function LandingHeader({ nav, header, locale }: LandingHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border-soft bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:flex-nowrap sm:px-6">
        <Link
          href="#home"
          className="flex items-center gap-2 font-semibold tracking-tight text-text-primary"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-(--neu-radius-md) bg-text-primary text-sm font-bold text-text-inverse shadow-neu-control">
            N
          </span>
          <span className="hidden text-sm sm:inline sm:text-base">{BRAND}</span>
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

        <div className="flex flex-wrap items-center justify-end gap-2">
          <LandingLanguageMenu locale={locale} />
          <ThemeToggle />
          <Link
            href={ROUTES.login}
            className="hidden rounded-(--neu-radius-pill) px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary sm:inline-flex"
          >
            {header.login}
          </Link>
          <Link
            href={ROUTES.register}
            aria-label={header.startFree}
            title={header.startFree}
            className="nv-access-pulse inline-flex h-9 w-9 items-center justify-center rounded-(--neu-radius-pill) bg-text-primary text-sm font-semibold text-text-inverse shadow-neu-control transition-all hover:shadow-neu-card active:scale-[0.98] active:shadow-neu-inset sm:w-auto sm:px-4"
          >
            <KeyRoundIcon size={17} strokeWidth={1.9} className="sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">{header.startFree}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
