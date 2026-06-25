import { BRAND, type LandingContent } from "../constants/landing-content";

interface LandingFooterProps {
  nav: LandingContent["nav"];
  footer: LandingContent["footer"];
}

/** Footer — бренд, повтор навигации, короткая подпись. */
export function LandingFooter({ nav, footer }: LandingFooterProps) {
  return (
    <footer className="border-t border-border-soft">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2 font-semibold tracking-tight text-text-primary">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-(--neu-radius-md) bg-text-primary text-sm font-bold text-text-inverse shadow-neu-control">
                N
              </span>
              {BRAND}
            </div>
            <p className="mt-4 text-sm text-text-secondary">{footer.text}</p>
          </div>

          <nav className="flex flex-col gap-2" aria-label="Footer">
            {nav.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-text-secondary transition-colors hover:text-text-primary"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="mt-10 border-t border-border-soft pt-6">
          <p className="text-xs text-text-muted">{footer.note}</p>
        </div>
      </div>
    </footer>
  );
}
