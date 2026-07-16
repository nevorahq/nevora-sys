import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import type { PublicLocale } from "@/shared/i18n/constants";
import {
  freePriceLabelByLocale,
  intervalLabelByLocale,
  intlLocaleTag,
  pricingPageCopyByLocale,
} from "@/modules/billing/plan-catalog.i18n";
import type { PublicPlanView } from "@/modules/billing/public-plan-view";
import { cn } from "@/shared/utils/cn";

interface PricingCardProps {
  plan: PublicPlanView;
  locale: PublicLocale;
  index: number;
}

function priceLabel(plan: PublicPlanView, locale: PublicLocale): string {
  if (plan.price.amount === null) return freePriceLabelByLocale[locale];
  return new Intl.NumberFormat(intlLocaleTag[locale], {
    style: "currency",
    currency: plan.price.currency,
    maximumFractionDigits: 0,
  }).format(plan.price.amount);
}

export function PricingCard({ plan, locale, index }: PricingCardProps) {
  const highlighted = plan.recommended;
  // Free-план всегда ведёт в реальную регистрацию (пробный период открыт).
  // В закрытой бете платные планы не покупаются → некликабельная подпись.
  const isTrial = plan.key === "free";
  const isInteractive = isTrial || plan.cta.mode === "checkout" || plan.cta.mode === "current";
  const interval = plan.price.interval ? intervalLabelByLocale[locale][plan.price.interval] : null;

  return (
    <div
      className={cn(
        "nv-fade-up flex flex-col p-6",
        highlighted ? "soft-card-lg ring-1 ring-text-primary/15" : "soft-card",
      )}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {highlighted && (
        <span className="mb-4 inline-flex w-fit rounded-(--neu-radius-pill) bg-text-primary px-3 py-1 text-xs font-semibold text-text-inverse">
          Recommended
        </span>
      )}

      <h3 className="text-lg font-semibold text-text-primary">{plan.name}</h3>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tracking-tight text-text-primary">
          {priceLabel(plan, locale)}
        </span>
        {interval && <span className="text-sm text-text-tertiary">/ {interval}</span>}
      </div>

      <p className="mt-3 text-sm text-text-secondary">{plan.description}</p>

      <ul className="mt-5 space-y-1.5 border-t border-border-soft pt-5 text-sm">
        {plan.limits.map((limit) => (
          <li key={limit.key} className="text-text-secondary">
            {limit.label}: <span className="text-text-primary">{limit.value}</span>
          </li>
        ))}
      </ul>

      <ul className="mt-5 flex-1 space-y-2.5 border-t border-border-soft pt-5">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm">
            <CheckIcon size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-accent-green" aria-hidden />
            <span className="text-text-primary">{feature}</span>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-xs text-text-tertiary">{plan.upgradeValue}</p>

      {isInteractive ? (
        <Link
          href={isTrial ? ROUTES.register : `${ROUTES.register}?plan=${plan.key}`}
          className={cn(
            "soft-focus mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-(--neu-radius-pill) px-6 text-sm font-semibold shadow-neu-control transition-shadow hover:shadow-neu-card active:shadow-neu-inset",
            highlighted
              ? "bg-text-primary text-text-inverse"
              : "border border-border-soft bg-surface text-text-primary hover:border-border-strong",
          )}
        >
          {plan.cta.label}
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className="mt-5 inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-(--neu-radius-pill) border border-border-soft bg-surface-muted px-6 text-sm font-semibold text-text-tertiary"
        >
          {plan.cta.label}
        </span>
      )}

      {plan.cta.mode === "private_beta" && !isTrial && (
        <p className="mt-3 text-center text-xs text-text-tertiary">
          {pricingPageCopyByLocale[locale].privateBetaCardNote}
        </p>
      )}
    </div>
  );
}
