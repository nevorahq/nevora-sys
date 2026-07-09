import Link from "next/link";
import { Check } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import { cn } from "@/shared/utils/cn";
import type { PublicPlanView } from "@/modules/billing/public-plan-view";

interface PricingCardProps {
  plan: PublicPlanView;
  index: number;
}

function priceLabel(plan: PublicPlanView): string {
  if (plan.price.amount === null) return "Free";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: plan.price.currency,
    maximumFractionDigits: 0,
  }).format(plan.price.amount);
}

export function PricingCard({ plan, index }: PricingCardProps) {
  const highlighted = plan.recommended;
  const disabled = plan.cta.mode === "contact";

  return (
    <div
      className={cn(
        "nv-fade-up nv-hover-lift flex flex-col p-6",
        highlighted
          ? "soft-card-lg ring-1 ring-text-primary/15"
          : "soft-card",
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {highlighted && (
        <span className="mb-4 inline-flex w-fit rounded-(--neu-radius-pill) bg-text-primary px-3 py-1 text-xs font-semibold text-text-inverse">
          Recommended
        </span>
      )}

      <h3 className="text-lg font-semibold text-text-primary">{plan.name}</h3>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tracking-tight text-text-primary">
          {priceLabel(plan)}
        </span>
        {plan.price.interval && <span className="text-sm text-text-muted">/ {plan.price.interval}</span>}
      </div>

      <p className="mt-3 text-sm text-text-secondary">{plan.description}</p>

      <ul className="mt-5 space-y-1.5 border-t border-border-soft pt-5 text-sm">
        {plan.limits.map((limit) => (
          <li key={limit.key} className="text-text-secondary">
            {limit.label}: {limit.value}
          </li>
        ))}
      </ul>

      <ul className="mt-5 flex-1 space-y-2.5 border-t border-border-soft pt-5">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm">
            <Check
              size={16}
              strokeWidth={2}
              className="mt-0.5 shrink-0 text-accent-green"
              aria-hidden
            />
            <span className="text-text-primary">{feature}</span>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-xs text-text-muted">{plan.upgradeValue}</p>

      {disabled ? (
        <span
          aria-disabled="true"
          className="mt-5 inline-flex w-full cursor-not-allowed items-center justify-center rounded-(--neu-radius-pill) border border-border-soft bg-surface-secondary px-6 py-2.5 text-sm font-semibold text-text-muted opacity-70"
        >
          {plan.cta.label}
        </span>
      ) : (
        <Link
          href={plan.key === "free" ? ROUTES.register : `${ROUTES.register}?plan=${plan.key}`}
          className={cn(
            "mt-5 inline-flex w-full items-center justify-center rounded-(--neu-radius-pill) px-6 py-2.5 text-sm font-semibold shadow-neu-control transition-all hover:shadow-neu-card active:scale-[0.98] active:shadow-neu-inset",
            highlighted
              ? "bg-text-primary text-text-inverse"
              : "border border-border-soft bg-surface text-text-primary hover:border-border-strong",
          )}
        >
          {plan.cta.label}
        </Link>
      )}

      {plan.cta.mode === "private_beta" && (
        <p className="mt-3 text-center text-xs text-text-muted">
          Private beta. We will enable paid checkout after Stripe is configured.
        </p>
      )}
    </div>
  );
}
