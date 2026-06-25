import Link from "next/link";
import { Check } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import { cn } from "@/shared/utils/cn";
import type { PricingPlan } from "../constants/landing-content";

interface PricingCardProps {
  plan: PricingPlan;
  storageLabel: string;
  bestForLabel: string;
  /** Индекс для staggered-анимации появления. */
  index: number;
}

/**
 * Карточка тарифа. Server Component, презентационный.
 * Pro выделяется через plan.highlight (бейдж + приподнятая карточка),
 * но без кричащих цветов — только тонкий ring и elevated-поверхность.
 */
export function PricingCard({
  plan,
  storageLabel,
  bestForLabel,
  index,
}: PricingCardProps) {
  const highlighted = Boolean(plan.highlight);
  // Until checkout is live, only the free trial can start from the landing
  // page. Paid plans stay visible for honest pricing context but cannot route
  // visitors into an activation flow that does not exist yet.
  const isTemporarilyUnavailable = ["start", "pro", "business"].includes(plan.id);

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
      {plan.highlight && (
        <span className="mb-4 inline-flex w-fit rounded-(--neu-radius-pill) bg-text-primary px-3 py-1 text-xs font-semibold text-text-inverse">
          {plan.highlight}
        </span>
      )}

      <h3 className="text-lg font-semibold text-text-primary">{plan.name}</h3>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tracking-tight text-text-primary">
          {plan.price}
        </span>
        <span className="text-sm text-text-muted">{plan.period}</span>
      </div>

      <p className="mt-3 text-sm text-text-secondary">{plan.description}</p>

      {/* Участники, хранилище и лимиты — компактный сканируемый блок */}
      <ul className="mt-5 space-y-1.5 border-t border-border-soft pt-5 text-sm">
        <li className="font-medium text-text-primary">{plan.members}</li>
        {plan.maxMembers && (
          <li className="text-text-secondary">{plan.maxMembers}</li>
        )}
        {plan.extraMember && (
          <li className="text-text-secondary">{plan.extraMember}</li>
        )}
        <li className="text-text-secondary">
          {storageLabel}: {plan.storage}
        </li>
        {plan.limits.map((limit) => (
          <li key={limit} className="text-text-secondary">
            {limit}
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

      <p className="mt-5 text-xs text-text-muted">
        <span className="font-medium text-text-secondary">{bestForLabel} </span>
        {plan.bestFor}
      </p>

      {isTemporarilyUnavailable ? (
        <span
          aria-disabled="true"
          className="mt-5 inline-flex w-full cursor-not-allowed items-center justify-center rounded-(--neu-radius-pill) border border-border-soft bg-surface-secondary px-6 py-2.5 text-sm font-semibold text-text-muted opacity-70"
        >
          {plan.cta}
        </span>
      ) : (
        <Link
          href={ROUTES.register}
          className={cn(
            "mt-5 inline-flex w-full items-center justify-center rounded-(--neu-radius-pill) px-6 py-2.5 text-sm font-semibold shadow-neu-control transition-all hover:shadow-neu-card active:scale-[0.98] active:shadow-neu-inset",
            highlighted
              ? "bg-text-primary text-text-inverse"
              : "border border-border-soft bg-surface text-text-primary hover:border-border-strong",
          )}
        >
          {plan.cta}
        </Link>
      )}

      {plan.microcopy && (
        <p className="mt-3 text-center text-xs text-text-muted">
          {plan.microcopy}
        </p>
      )}
    </div>
  );
}
