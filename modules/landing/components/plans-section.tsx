import type { LandingContent } from "../constants/landing-content";
import { PricingCard } from "./pricing-card";

/**
 * Plans — 4 тарифа (Free Trial / Start / Pro / Business) + trial-note.
 * Сетка: 1 колонка на мобильном, 2 на планшете, 4 на больших экранах.
 * Цены/лимиты живут в constants/landing-content.ts (PricingPlan[]).
 */
export function PlansSection({ content }: { content: LandingContent["plans"] }) {
  return (
    <section id="plan" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {content.title}
        </h2>
        <p className="mt-3 text-text-secondary">{content.subtitle}</p>
        <p className="mt-4 max-w-xl text-sm text-text-muted">
          {content.explanation}
        </p>
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {content.items.map((plan, i) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            storageLabel={content.storageLabel}
            bestForLabel={content.bestForLabel}
            index={i}
          />
        ))}
      </div>

      <div className="soft-inset mt-10 p-8">
        <p className="font-medium text-text-primary">{content.trialNote.lead}</p>
        <p className="mt-3 max-w-2xl text-sm text-text-secondary">
          {content.trialNote.body}
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-secondary">
          {content.trialNote.points.map((point) => (
            <li key={point} className="font-medium">
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
