import Link from "next/link";
import { Fragment } from "react";
import { CheckIcon } from "lucide-react";
import { getPublicPlanViews } from "@/modules/billing/public-plan-view";
import { getStripeConfig } from "@/modules/billing/config/stripe-env";
import { ROUTES } from "@/shared/config/routes";
import { cn } from "@/shared/utils/cn";

export const dynamic = "force-dynamic";

function priceLabel(plan: ReturnType<typeof getPublicPlanViews>[number]) {
  if (plan.price.amount === null) return "Free";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: plan.price.currency,
    maximumFractionDigits: 0,
  }).format(plan.price.amount);
}

function planHref(plan: ReturnType<typeof getPublicPlanViews>[number]) {
  if (plan.cta.mode === "contact") {
    return "mailto:nevorahq@gmail.com?subject=Nevora%20Business%20plan";
  }
  return plan.key === "free" ? ROUTES.register : `${ROUTES.register}?plan=${plan.key}`;
}

export default function PricingPage() {
  const billingMode = getStripeConfig().mode;
  const plans = getPublicPlanViews();
  const limitKeys = plans[0]?.limits.map((limit) => limit.key) ?? [];

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 border-b border-border-soft pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">Pricing</p>
            <h1 className="mt-2 text-3xl font-semibold text-text-primary">Nevora Business OS plans</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
              Plans, limits, and upgrade CTAs are rendered from the billing catalog used by backend gates.
            </p>
            {billingMode === "private_beta" && (
              <p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">
                Nevora is in private beta. Paid checkout is not available yet; request access and we will activate billing when Stripe runtime configuration is complete.
              </p>
            )}
          </div>
          <Link
            href={ROUTES.register}
            className="inline-flex items-center justify-center rounded-(--neu-radius-pill) bg-text-primary px-5 py-2.5 text-sm font-semibold text-text-inverse shadow-neu-control"
          >
            Request access
          </Link>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-4">
          {plans.map((plan) => (
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
                {priceLabel(plan)}
                {plan.price.interval && <span className="text-sm font-medium text-text-muted"> / {plan.price.interval}</span>}
              </p>
              <Link
                href={planHref(plan)}
                className={cn(
                  "mt-5 inline-flex items-center justify-center rounded-(--neu-radius-pill) px-5 py-2.5 text-sm font-semibold shadow-neu-control",
                  plan.recommended
                    ? "bg-text-primary text-text-inverse"
                    : "border border-border-soft bg-surface text-text-primary",
                )}
              >
                {plan.cta.label}
              </Link>
              {plan.cta.mode === "private_beta" && (
                <p className="mt-2 text-center text-xs text-text-muted">Private beta. No paid checkout yet.</p>
              )}
            </section>
          ))}
        </div>

        <section className="mt-8 overflow-hidden rounded-(--neu-radius-md) border border-border-soft bg-surface">
          <div className="grid grid-cols-[minmax(180px,1.2fr)_repeat(4,minmax(120px,1fr))] border-b border-border-soft text-sm">
            <div className="bg-surface-muted p-3 font-semibold text-text-primary">Limits</div>
            {plans.map((plan) => (
              <div key={plan.key} className="bg-surface-muted p-3 font-semibold text-text-primary">
                {plan.name}
              </div>
            ))}
            {limitKeys.map((limitKey) => (
              <Fragment key={limitKey}>
                <div className="border-t border-border-soft p-3 text-text-secondary">
                  {plans[0]?.limits.find((limit) => limit.key === limitKey)?.label ?? limitKey}
                </div>
                {plans.map((plan) => (
                  <div key={`${plan.key}-${limitKey}`} className="border-t border-border-soft p-3 text-text-primary">
                    {plan.limits.find((limit) => limit.key === limitKey)?.value ?? "-"}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-4">
          {plans.map((plan) => (
            <div key={`${plan.key}-features`} className="soft-card-sm p-5">
              <h2 className="text-sm font-semibold text-text-primary">{plan.name} features</h2>
              <ul className="mt-4 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-text-secondary">
                    <CheckIcon size={15} className="mt-0.5 shrink-0 text-accent-green" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
