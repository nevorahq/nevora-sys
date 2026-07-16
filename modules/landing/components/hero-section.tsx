import Link from "next/link";
import { ShieldCheckIcon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import type { LandingContent } from "../constants/landing-content";

/** Hero — первый экран: что это, для кого, что делает ИИ, кто решает. */
export function HeroSection({ content }: { content: LandingContent["hero"] }) {
  return (
    <section
      id="home"
      className="mx-auto max-w-3xl px-4 pt-16 pb-14 text-center sm:px-6 sm:pt-24 sm:pb-20"
    >
      <h1
        className="nv-fade-up text-balance text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl"
        style={{ animationDelay: "60ms" }}
      >
        {content.title}
      </h1>

      <p
        className="nv-fade-up mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-text-secondary sm:text-lg"
        style={{ animationDelay: "140ms" }}
      >
        {content.subtitle}
      </p>

      <p
        className="nv-fade-up mx-auto mt-4 max-w-xl text-sm text-text-tertiary"
        style={{ animationDelay: "200ms" }}
      >
        {content.audience}
      </p>

      <div
        className="nv-fade-up mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        style={{ animationDelay: "280ms" }}
      >
        <Link
          href={ROUTES.register}
          className="soft-focus inline-flex min-h-11 w-full items-center justify-center rounded-(--neu-radius-pill) bg-text-primary px-7 text-sm font-semibold text-text-inverse shadow-neu-control transition-shadow hover:shadow-neu-card active:shadow-neu-inset sm:w-auto"
        >
          {content.primaryCta}
        </Link>
        <a
          href="#pricing"
          className="soft-focus inline-flex min-h-11 w-full items-center justify-center rounded-(--neu-radius-pill) border border-border-soft bg-surface px-7 text-sm font-semibold text-text-primary shadow-neu-control transition-shadow hover:shadow-neu-card active:shadow-neu-inset sm:w-auto"
        >
          {content.secondaryCta}
        </a>
      </div>

      <p
        className="nv-fade-in mx-auto mt-6 inline-flex items-center gap-2 text-sm font-medium text-text-secondary"
        style={{ animationDelay: "380ms" }}
      >
        <ShieldCheckIcon size={16} strokeWidth={1.9} className="shrink-0 text-accent-green" aria-hidden="true" />
        {content.trust}
      </p>

      <p
        className="nv-fade-in mt-4 text-xs text-text-tertiary"
        style={{ animationDelay: "440ms" }}
      >
        {content.microcopy}
      </p>
    </section>
  );
}
