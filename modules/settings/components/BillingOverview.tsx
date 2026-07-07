"use client";

import { useState, useTransition } from "react";
import { BotIcon, CreditCardIcon, DatabaseIcon, ExternalLinkIcon, FileTextIcon, ShieldCheckIcon, UsersRoundIcon } from "lucide-react";
import { createBillingPortalSession } from "../actions/create-billing-portal-session";
import { createCheckoutSessionAction } from "@/modules/billing/actions/create-checkout-session.action";
import type { BillingSettingsOverview } from "../types/settings.types";
import { PLAN_LABELS } from "@/modules/billing/constants/billing.constants";
import { getAccessStateView } from "@/modules/billing/services/access-state-ui";
import { isTrialAlreadyUsed } from "@/modules/billing/services/entitlement";
import { AccessStateBadge, BillingRequiredAlert } from "@/modules/billing/components/access-state";
import { Button } from "@/shared/ui/button";
import { UsageLimitsCard } from "./UsageLimitsCard";

export function BillingOverview({ overview }: { overview: BillingSettingsOverview }) {
  const [pending, startTransition] = useTransition();
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const subscription = overview.subscription;
  const accessView = getAccessStateView(overview.accessState);
  const trialEndsAt = subscription?.trial_ends_at
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(subscription.trial_ends_at))
    : null;
  const usedTrial = isTrialAlreadyUsed(overview.trialEligibility);
  const visiblePlans = usedTrial
    ? overview.plans.filter((plan) => plan.slug !== "trial")
    : overview.plans;
  const usageByKey = Object.fromEntries(overview.usage.map((item) => [item.key, item]));

  function manageBilling() {
    setMessage(null);
    startTransition(async () => {
      const result = await createBillingPortalSession();
      if (result.portalUrl) {
        window.location.href = result.portalUrl;
        return;
      }
      setMessage(result.error ?? result.success ?? null);
    });
  }

  function startCheckout(planId: string, planSlug: string) {
    setMessage(null);
    setPendingPlanId(planId);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("planSlug", planSlug);
      formData.set("billingCycle", subscription?.billing_cycle ?? "monthly");
      const result = await createCheckoutSessionAction({}, formData);
      setPendingPlanId(null);
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      setMessage(result.error ?? result.success ?? null);
    });
  }

  return (
    <div className="space-y-5">
      {overview.unlimitedAccess && <div className="flex gap-3 rounded-(--neu-radius-md) border border-accent-lilac bg-accent-lilac-soft/40 p-4"><ShieldCheckIcon size={18} /><div><p className="text-sm font-semibold text-text-primary">Developer Access</p><p className="text-xs text-text-secondary">Product limits are unlimited; security protections remain active.</p></div></div>}
      {!overview.unlimitedAccess && accessView.shouldWarn && (
        <BillingRequiredAlert title={accessView.label} message={accessView.banner} />
      )}

      <section className="soft-card flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-muted">Current plan</p>
          <h2 className="mt-1 text-2xl font-semibold text-text-primary">{subscription ? PLAN_LABELS[subscription.plan.slug] : "No active plan"}</h2>
          <p className="mt-1 text-sm text-text-muted">{subscription?.status === "trialing" && subscription.trial_ends_at ? `Trial ends ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(subscription.trial_ends_at))}` : subscription ? `Status: ${subscription.status}` : "Contact support to initialize billing."}</p>
        </div>
        <Button type="button" onClick={manageBilling} isLoading={pending}>{pending ? "Opening…" : "Manage billing"}<ExternalLinkIcon size={14} /></Button>
      </section>
      {message && <p className="text-sm text-text-secondary" role="status">{message}</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard title="Current access state" value={<AccessStateBadge state={overview.accessState} />} description={accessView.reason || "All plan actions are available."} icon={<ShieldCheckIcon size={16} />} />
        <OverviewCard title="Trial status" value={subscription?.plan.slug === "trial" ? (subscription.status === "trialing" ? "Trialing" : "Trial used") : "Not on trial"} description={trialEndsAt ? `Trial end: ${trialEndsAt}` : usedTrial ? "Free trial already used." : "Paid plans are available."} icon={<CreditCardIcon size={16} />} />
        <OverviewCard title="Plan and limits" value={subscription ? PLAN_LABELS[subscription.plan.slug] : "No plan"} description={overview.unlimitedAccess ? "Developer unlimited is active." : `${overview.usage.length} tracked limits`} icon={<DatabaseIcon size={16} />} />
        <OverviewCard title="Security/audit overview" value={`${overview.recentAuditEvents}`} description="Audit log entries visible to this organization." icon={<ShieldCheckIcon size={16} />} />
        <OverviewCard title="Members usage" value={formatUsage(usageByKey.members)} description="Active and invited seats." icon={<UsersRoundIcon size={16} />} />
        <OverviewCard title="Storage usage" value={formatUsage(usageByKey.storage)} description="Document attachment storage." icon={<DatabaseIcon size={16} />} />
        <OverviewCard title="AI usage" value={formatUsage(usageByKey.ai_requests)} description="Monthly AI request usage." icon={<BotIcon size={16} />} />
      </div>

      <UsageLimitsCard usage={overview.usage} />

      <div className="grid gap-5 md:grid-cols-2">
        <section className="soft-card-sm p-5">
          <div className="flex items-center gap-2"><CreditCardIcon size={17} className="text-text-muted" /><h2 className="text-sm font-semibold text-text-primary">Payment method</h2></div>
          <p className="mt-4 text-sm text-text-muted">{overview.providerConnected ? "Managed securely by the billing provider." : "Billing provider is not connected yet."}</p>
        </section>
        <section className="soft-card-sm p-5">
          <div className="flex items-center gap-2"><FileTextIcon size={17} className="text-text-muted" /><h2 className="text-sm font-semibold text-text-primary">Invoice history</h2></div>
          {overview.invoices.length === 0 ? <p className="mt-4 text-sm text-text-muted">No invoices yet.</p> : <ul className="mt-4 divide-y divide-border-soft">{overview.invoices.map((invoice) => <li key={invoice.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="text-text-secondary">{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(invoice.created_at))}</span><span className="font-medium text-text-primary">{new Intl.NumberFormat("en", { style: "currency", currency: invoice.currency }).format(invoice.amount)}</span>{invoice.pdf_url && <a href={invoice.pdf_url} target="_blank" rel="noreferrer" className="text-xs underline">PDF</a>}</li>)}</ul>}
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Plans</h2>
        {usedTrial && subscription?.plan.slug === "trial" && subscription.status !== "trialing" && (
          <div className="mb-3 rounded-(--neu-radius-md) border border-border-soft bg-surface-muted p-4">
            <p className="text-sm font-semibold text-text-primary">The free trial was already used for your account.</p>
            <p className="mt-1 text-sm text-text-muted">To continue working, choose the Start, Pro or Business plan, or <a className="underline" href="mailto:nevorahq@gmail.com?subject=Nevora%20plan%20activation">contact support</a>.</p>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visiblePlans.map((plan) => {
          const isCurrent = subscription?.plan_id === plan.id;
          const isTrial = plan.slug === "trial";
          const isPending = pending && pendingPlanId === plan.id;
          return (
            <div key={plan.id} className="soft-card-sm p-4">
              <p className="font-semibold text-text-primary">{PLAN_LABELS[plan.slug]}</p>
              <p className="mt-1 text-sm text-text-muted">{Number(plan.price_monthly) === 0 ? "Free" : `${new Intl.NumberFormat("en", { style: "currency", currency: plan.currency, maximumFractionDigits: 0 }).format(Number(plan.price_monthly))} / month`}</p>
              <Button
                type="button"
                variant="secondary"
                disabled={isCurrent || isTrial || pending}
                isLoading={isPending}
                aria-label={isCurrent ? `${PLAN_LABELS[plan.slug]} is your current plan` : `Choose ${PLAN_LABELS[plan.slug]} plan`}
                onClick={() => startCheckout(plan.id, plan.slug)}
                className="mt-4 w-full"
              >
                {isCurrent ? "Current plan" : isTrial ? "Trial at signup" : isPending ? "Opening..." : "Choose plan"}
              </Button>
            </div>
          );
        })}</div>
      </section>
    </div>
  );
}

function formatUsage(item: BillingSettingsOverview["usage"][number] | undefined) {
  if (!item) return "Not tracked";
  const used = `${item.used}${item.unit ? ` ${item.unit}` : ""}`;
  const limit = item.limit === null ? "∞" : `${item.limit}${item.unit ? ` ${item.unit}` : ""}`;
  return `${used} / ${limit}`;
}

function OverviewCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: React.ReactNode;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="soft-card-sm p-4">
      <div className="flex items-center gap-2 text-text-muted">
        {icon}
        <p className="text-xs font-medium uppercase tracking-wide">{title}</p>
      </div>
      <div className="mt-3 text-sm font-semibold text-text-primary">{value}</div>
      <p className="mt-2 text-xs leading-5 text-text-muted">{description}</p>
    </section>
  );
}
