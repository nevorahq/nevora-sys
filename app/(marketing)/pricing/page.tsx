import Link from "next/link";
import { Fragment } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import {
  commercialFeatureKeys,
  commercialUsageMetricKeys,
} from "@/modules/billing/plan-catalog.schema";
import {
  commercialFeatureLabels,
  commercialPlans,
  commercialUsageLabels,
  formatCommercialLimit,
} from "@/modules/billing/plan-catalog";
import { ROUTES } from "@/shared/config/routes";
import { cn } from "@/shared/utils/cn";

export const dynamic = "force-dynamic";

function price(plan: (typeof commercialPlans)[number]) {
  if (plan.monthlyPrice === 0) return "Free";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: plan.currency,
    maximumFractionDigits: 0,
  }).format(plan.monthlyPrice);
}

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 border-b border-border-soft pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">Pricing</p>
            <h1 className="mt-2 text-3xl font-semibold text-text-primary">Nevora Business OS plans</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
              Every feature, limit, and upgrade path below is rendered from the same catalog used by backend gates.
            </p>
          </div>
          <Link
            href={ROUTES.register}
            className="inline-flex items-center justify-center rounded-(--neu-radius-pill) bg-text-primary px-5 py-2.5 text-sm font-semibold text-text-inverse shadow-neu-control"
          >
            Start trial
          </Link>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-4">
          {commercialPlans.map((plan) => (
            <section
              key={plan.key}
              className={cn(
                "soft-card-sm flex flex-col p-5",
                plan.recommended && "ring-1 ring-text-primary/20",
              )}
            >
              {plan.recommended && (
                <span className="mb-3 w-fit rounded-(--neu-radius-pill) bg-text-primary px-3 py-1 text-xs font-semibold text-text-inverse">
                  Recommended
                </span>
              )}
              <h2 className="text-lg font-semibold text-text-primary">{plan.name}</h2>
              <p className="mt-2 min-h-12 text-sm text-text-muted">{plan.description}</p>
              <p className="mt-5 text-3xl font-semibold text-text-primary">
                {price(plan)}
                {plan.monthlyPrice > 0 && <span className="text-sm font-medium text-text-muted"> / month</span>}
              </p>
              <Link
                href={plan.checkoutEnabled ? `${ROUTES.register}?plan=${plan.key}` : ROUTES.register}
                className={cn(
                  "mt-5 inline-flex items-center justify-center rounded-(--neu-radius-pill) px-5 py-2.5 text-sm font-semibold shadow-neu-control",
                  plan.recommended
                    ? "bg-text-primary text-text-inverse"
                    : "border border-border-soft bg-surface text-text-primary",
                )}
              >
                {plan.contactSales ? "Choose Business" : plan.checkoutEnabled ? "Choose plan" : "Start free"}
              </Link>
              {plan.contactSales && (
                <a
                  href="mailto:nevorahq@gmail.com?subject=Nevora%20Business%20plan"
                  className="mt-2 text-center text-xs font-medium text-text-muted underline"
                >
                  Contact sales
                </a>
              )}
            </section>
          ))}
        </div>

        <section className="mt-8 overflow-hidden rounded-(--neu-radius-md) border border-border-soft bg-surface">
          <div className="grid grid-cols-[minmax(180px,1.2fr)_repeat(4,minmax(120px,1fr))] border-b border-border-soft text-sm">
            <div className="bg-surface-muted p-3 font-semibold text-text-primary">Limits</div>
            {commercialPlans.map((plan) => (
              <div key={plan.key} className="bg-surface-muted p-3 font-semibold text-text-primary">
                {plan.name}
              </div>
            ))}
            {commercialUsageMetricKeys.map((metricKey) => (
              <Fragment key={metricKey}>
                <div key={`${metricKey}-label`} className="border-t border-border-soft p-3 text-text-secondary">
                  {commercialUsageLabels[metricKey]}
                </div>
                {commercialPlans.map((plan) => (
                  <div key={`${plan.key}-${metricKey}`} className="border-t border-border-soft p-3 text-text-primary">
                    {formatCommercialLimit(metricKey, plan.usageLimits[metricKey])}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-(--neu-radius-md) border border-border-soft bg-surface">
          <div className="grid grid-cols-[minmax(180px,1.2fr)_repeat(4,minmax(120px,1fr))] border-b border-border-soft text-sm">
            <div className="bg-surface-muted p-3 font-semibold text-text-primary">Features</div>
            {commercialPlans.map((plan) => (
              <div key={plan.key} className="bg-surface-muted p-3 font-semibold text-text-primary">
                {plan.name}
              </div>
            ))}
            {commercialFeatureKeys.map((featureKey) => (
              <Fragment key={featureKey}>
                <div key={`${featureKey}-label`} className="border-t border-border-soft p-3 text-text-secondary">
                  {commercialFeatureLabels[featureKey]}
                </div>
                {commercialPlans.map((plan) => {
                  const enabled = plan.featureKeys.includes(featureKey);
                  return (
                    <div key={`${plan.key}-${featureKey}`} className="border-t border-border-soft p-3">
                      {enabled ? (
                        <span className="inline-flex items-center gap-1 text-accent-green">
                          <CheckIcon size={15} /> Included
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-text-muted">
                          <XIcon size={15} /> Not included
                        </span>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
