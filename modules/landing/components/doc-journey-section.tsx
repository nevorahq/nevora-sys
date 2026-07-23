import {
  ArrowRightIcon,
  UploadIcon,
  ScanTextIcon,
  SplitIcon,
  BadgeCheckIcon,
} from "lucide-react";
import type { LandingContent } from "../constants/landing-content";

/**
 * Флагманский путь «документ → оплаченное обязательство». Тот же визуальный язык,
 * что у секции «как это работает»: связная стрелочная цепочка, а не набор карточек.
 * Иконки по позиции — порядок шагов фиксирован контрактом потока, не переводом.
 */
const STEP_ICONS = [UploadIcon, ScanTextIcon, SplitIcon, BadgeCheckIcon] as const;

export function DocJourneySection({ content }: { content: LandingContent["docJourney"] }) {
  return (
    <section id="doc-journey" className="bg-surface-sunken/40 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            {content.title}
          </h2>
          <p className="mt-3 text-pretty text-text-secondary">{content.subtitle}</p>
        </div>

        <ol className="mt-12 flex flex-col items-stretch gap-4 md:flex-row md:items-center md:gap-2">
          {content.steps.map((step, i) => {
            const Icon = STEP_ICONS[i] ?? UploadIcon;
            return (
              <li
                key={step.title}
                className="flex flex-1 flex-col items-stretch gap-4 md:flex-row md:items-center"
              >
                <div
                  className="nv-fade-up soft-card flex flex-1 flex-col p-6"
                  style={{ animationDelay: `${i * 90}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-(--neu-radius-md) bg-surface-sunken text-text-primary shadow-neu-inset">
                      <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                      {step.badge}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-text-primary">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{step.text}</p>
                </div>

                {i < content.steps.length - 1 && (
                  <ArrowRightIcon
                    size={22}
                    strokeWidth={1.8}
                    aria-hidden="true"
                    className="mx-auto shrink-0 rotate-90 text-text-tertiary md:rotate-0"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
