import Link from "next/link";
import { ROUTES } from "@/shared/config/routes";
import {
  LEGAL_UI,
  type LegalBlock,
  type LegalDocument,
  type LegalLocale,
  type LegalPage,
} from "../content/legal-content";

interface LegalPageShellProps {
  document: LegalDocument;
  locale: LegalLocale;
  page: LegalPage;
}

const pageRoutes: Record<LegalPage, string> = {
  terms: ROUTES.terms,
  privacy: ROUTES.privacy,
  refunds: ROUTES.refunds,
};

function localizedHref(page: LegalPage, locale: LegalLocale) {
  return `${pageRoutes[page]}?lang=${locale}`;
}

function renderBlock(block: LegalBlock, index: number) {
  switch (block.type) {
    case "paragraph":
      return (
        <p key={index} className="text-[0.96rem] leading-7 text-text-secondary">
          {block.text}
        </p>
      );
    case "subheading":
      return (
        <h3 key={index} className="pt-2 text-base font-semibold text-text-primary">
          {block.title}
        </h3>
      );
    case "bullets":
      return (
        <ul key={index} className="space-y-2 pl-5 text-[0.96rem] leading-7 text-text-secondary">
          {block.items.map((item) => (
            <li key={item} className="list-disc pl-1">
              {item}
            </li>
          ))}
        </ul>
      );
    case "contact":
      return (
        <address key={index} className="not-italic text-[0.96rem] leading-7 text-text-secondary">
          {block.lines.map((line) => (
            <div key={`${line.label}-${line.value ?? "name"}`}>
              <span className="font-semibold text-text-primary">{line.label}</span>
              {line.value ? <span>: {line.value}</span> : null}
            </div>
          ))}
        </address>
      );
  }
}

export function LegalPageShell({ document, locale, page }: LegalPageShellProps) {
  const ui = LEGAL_UI[locale];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border-soft bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between">
          <Link href={ROUTES.home} className="flex w-fit items-center gap-2 font-semibold tracking-tight text-text-primary">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-(--neu-radius-md) bg-text-primary text-sm font-bold text-text-inverse shadow-neu-control">
              N
            </span>
            <span>Nevora Business OS</span>
          </Link>
        </div>
      </header>

      <main lang={locale} className="mx-auto w-full max-w-4xl flex-1 px-4 py-14 sm:px-6 sm:py-20">
        <div className="mb-10 border-b border-border-soft pb-8">
          <p className="text-sm font-medium text-text-muted">
            {document.lastUpdatedLabel}: {document.lastUpdated}
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight text-text-primary sm:text-5xl">
            {document.title}
          </h1>
        </div>

        <article className="space-y-10">
          <section className="space-y-4">{document.intro.map(renderBlock)}</section>

          {document.sections.map((section) => (
            <section key={section.title} className="space-y-4 scroll-mt-24">
              <h2 className="text-2xl font-semibold leading-tight text-text-primary">{section.title}</h2>
              {section.blocks.map(renderBlock)}
            </section>
          ))}
        </article>
      </main>

      <footer className="border-t border-border-soft">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-text-secondary sm:px-6 md:flex-row md:items-center md:justify-between">
          <Link href={ROUTES.home} className="transition-colors hover:text-text-primary">
            {ui.home}
          </Link>
          <nav className="flex flex-wrap gap-4" aria-label={ui.legal}>
            <Link
              href={localizedHref("terms", locale)}
              aria-current={page === "terms" ? "page" : undefined}
              className="transition-colors hover:text-text-primary aria-[current=page]:font-semibold aria-[current=page]:text-text-primary"
            >
              {ui.terms}
            </Link>
            <Link
              href={localizedHref("privacy", locale)}
              aria-current={page === "privacy" ? "page" : undefined}
              className="transition-colors hover:text-text-primary aria-[current=page]:font-semibold aria-[current=page]:text-text-primary"
            >
              {ui.privacy}
            </Link>
            <Link
              href={localizedHref("refunds", locale)}
              aria-current={page === "refunds" ? "page" : undefined}
              className="transition-colors hover:text-text-primary aria-[current=page]:font-semibold aria-[current=page]:text-text-primary"
            >
              {ui.refunds}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
