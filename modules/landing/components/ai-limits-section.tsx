import { CheckIcon, XIcon } from "lucide-react";
import type { LandingContent } from "../constants/landing-content";

/**
 * Что ИИ может и, главное, чего не может сам (`docs/contracts/ai-governance.md`).
 * Две колонки — «может» и «никогда сам не» — рядом, чтобы граница читалась как
 * контракт, а не как маркетинг.
 */
export function AiLimitsSection({ content }: { content: LandingContent["aiLimits"] }) {
  return (
    <section id="ai-limits" className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {content.title}
        </h2>
        <p className="mt-3 text-pretty text-text-secondary">{content.subtitle}</p>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <div className="soft-card p-6">
          <h3 className="flex items-center gap-2 font-semibold text-text-primary">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckIcon size={15} strokeWidth={2.4} aria-hidden="true" />
            </span>
            {content.can.title}
          </h3>
          <ul className="mt-4 space-y-3">
            {content.can.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-text-secondary">
                <CheckIcon
                  size={16}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-success"
                />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="soft-card p-6">
          <h3 className="flex items-center gap-2 font-semibold text-text-primary">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-danger-soft text-danger">
              <XIcon size={15} strokeWidth={2.4} aria-hidden="true" />
            </span>
            {content.cannot.title}
          </h3>
          <ul className="mt-4 space-y-3">
            {content.cannot.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-text-secondary">
                <XIcon
                  size={16}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-danger"
                />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mx-auto mt-8 max-w-2xl text-center text-sm font-medium text-text-secondary">
        {content.closing}
      </p>
    </section>
  );
}
