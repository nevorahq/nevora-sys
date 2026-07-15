import { getPublicPlanViews } from "@/modules/billing/public-plan-view";
import { getPaddleConfig } from "@/modules/billing/config/paddle-env";
import type { PublicLocale } from "@/shared/i18n/constants";
import type { LandingContent } from "../constants/landing-content";
import { PricingCard } from "./pricing-card";

interface PlansSectionProps {
  content: LandingContent["plans"];
  locale: PublicLocale;
}

export function PlansSection({ content, locale }: PlansSectionProps) {
  const plans = getPublicPlanViews(getPaddleConfig(), locale);

  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
          {content.title}
        </h2>
        <p className="mt-3 text-pretty text-text-secondary">{content.subtitle}</p>
      </div>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan, i) => (
          <PricingCard key={plan.key} plan={plan} locale={locale} index={i} />
        ))}
      </div>

      <div className="soft-inset mx-auto mt-10 max-w-3xl p-6 sm:p-8">
        <p className="font-medium text-text-primary">{content.note.lead}</p>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-secondary">
          {content.note.points.map((point) => (
            <li key={point} className="flex items-center gap-2 font-medium">
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-green" />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
