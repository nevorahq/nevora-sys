import Link from "next/link";
import { ROUTES } from "@/shared/config/routes";
import type { PublicLocale } from "@/shared/i18n/constants";
import { BRAND, type LandingContent } from "../constants/landing-content";

interface LandingFooterProps {
  nav: LandingContent["nav"];
  footer: LandingContent["footer"];
  locale: PublicLocale;
}

/** Footer — бренд, навигация и legal-ссылки, сохраняющие текущую локаль (?lang). */
export function LandingFooter({ nav, footer, locale }: LandingFooterProps) {
  const legalHref = (path: string) => `${path}?lang=${locale}`;

  return (
    <footer className="border-t border-border-soft">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="max-w-sm">
          <div className="flex items-center gap-2 font-semibold tracking-tight text-text-primary">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-(--neu-radius-md) bg-text-primary text-sm font-bold text-text-inverse shadow-neu-control">
              N
            </span>
            {BRAND}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-text-secondary">{footer.tagline}</p>
        </div>

        <nav className="flex flex-col gap-2.5" aria-label={footer.productHeading}>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {footer.productHeading}
          </p>
          {nav.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="soft-focus text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <nav className="flex flex-col gap-2.5" aria-label={footer.legalHeading}>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {footer.legalHeading}
          </p>
          <Link href={legalHref(ROUTES.terms)} className="soft-focus text-sm text-text-secondary transition-colors hover:text-text-primary">
            {footer.terms}
          </Link>
          <Link href={legalHref(ROUTES.privacy)} className="soft-focus text-sm text-text-secondary transition-colors hover:text-text-primary">
            {footer.privacy}
          </Link>
          <Link href={legalHref(ROUTES.refunds)} className="soft-focus text-sm text-text-secondary transition-colors hover:text-text-primary">
            {footer.refunds}
          </Link>
        </nav>
      </div>

      <div className="mx-auto max-w-6xl border-t border-border-soft px-4 py-6 sm:px-6">
        <p className="text-xs text-text-tertiary">{footer.note}</p>
      </div>
    </footer>
  );
}
