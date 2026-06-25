import Link from "next/link";
import { ROUTES } from "@/shared/config/routes";
import type { LandingContent } from "../constants/landing-content";

/** Hero — первый экран. Заголовок, честный сабтайтл, два CTA, microcopy. */
export function HeroSection({ content }: { content: LandingContent["hero"] }) {
  return (
    <section
      id="home"
      className="mx-auto max-w-3xl px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-28 sm:pb-24"
    >
      <h1
        className="nv-fade-up text-balance text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl md:text-6xl"
        style={{ animationDelay: "60ms" }}
      >
        {content.title}
      </h1>

      <p
        className="nv-fade-up mx-auto mt-6 max-w-2xl text-pretty text-base text-text-secondary sm:text-lg"
        style={{ animationDelay: "160ms" }}
      >
        {content.subtitle}
      </p>

      <div
        className="nv-fade-up mx-auto mt-8 max-w-xl space-y-1 text-sm text-text-muted"
        style={{ animationDelay: "240ms" }}
      >
        {content.supporting.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p className="pt-3 font-medium text-text-secondary">{content.goal}</p>
      </div>

      <div
        className="nv-fade-up mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        style={{ animationDelay: "320ms" }}
      >
        <Link
          href={ROUTES.register}
          className="inline-flex w-full items-center justify-center rounded-(--neu-radius-pill) bg-text-primary px-7 py-3 text-sm font-semibold text-text-inverse shadow-neu-control transition-all hover:shadow-neu-card active:scale-[0.98] active:shadow-neu-inset sm:w-auto"
        >
          {content.primaryCta}
        </Link>
        <a
          href="#plan"
          className="inline-flex w-full items-center justify-center rounded-(--neu-radius-pill) border border-border-soft bg-surface px-7 py-3 text-sm font-semibold text-text-primary shadow-neu-control transition-all hover:border-border-strong hover:shadow-neu-card active:scale-[0.98] active:shadow-neu-inset sm:w-auto"
        >
          {content.secondaryCta}
        </a>
      </div>

      <p
        className="nv-fade-in mt-6 text-xs text-text-muted"
        style={{ animationDelay: "440ms" }}
      >
        {content.microcopy}
      </p>
    </section>
  );
}
