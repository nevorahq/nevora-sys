import { ArrowRightIcon, InboxIcon, SparklesIcon, CircleCheckIcon } from "lucide-react";
import type { LandingContent } from "../constants/landing-content";

const STEP_ICONS = [InboxIcon, SparklesIcon, CircleCheckIcon] as const;

/**
 * Как работает Nevora — единый цикл «добавить → проверить → выполнить».
 * Служит визуальным якорем продукта: связная схема потока, а не набор карточек.
 * Горизонтальная на десктопе, вертикальная на мобильном.
 */
export function HowItWorksSection({ content }: { content: LandingContent["how"] }) {
  return (
    <section id="how" className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {content.title}
        </h2>
        <p className="mt-3 text-pretty text-text-secondary">{content.subtitle}</p>
      </div>

      <ol className="mt-12 flex flex-col items-stretch gap-4 md:flex-row md:items-center md:gap-2">
        {content.steps.map((step, i) => {
          const Icon = STEP_ICONS[i] ?? InboxIcon;
          return (
            <li key={step.title} className="flex flex-1 flex-col items-stretch gap-4 md:flex-row md:items-center">
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
    </section>
  );
}
