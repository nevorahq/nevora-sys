"use client";

import { useState, useTransition } from "react";
import { CreditCardIcon, ExternalLinkIcon, FileTextIcon, ShieldCheckIcon } from "lucide-react";
import { createBillingPortalSession } from "../actions/create-billing-portal-session";
import type { BillingSettingsOverview } from "../types/settings.types";
import { PLAN_LABELS } from "@/modules/billing/constants/billing.constants";
import { Button } from "@/shared/ui/button";
import { UsageLimitsCard } from "./UsageLimitsCard";

export function BillingOverview({ overview }: { overview: BillingSettingsOverview }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const subscription = overview.subscription;

  function manageBilling() {
    setMessage(null);
    startTransition(async () => {
      const result = await createBillingPortalSession();
      setMessage(result.error ?? result.success ?? null);
    });
  }

  return (
    <div className="space-y-5">
      {overview.unlimitedAccess && <div className="flex gap-3 rounded-(--neu-radius-md) border border-accent-lilac bg-accent-lilac-soft/40 p-4"><ShieldCheckIcon size={18} /><div><p className="text-sm font-semibold text-text-primary">Developer Access</p><p className="text-xs text-text-secondary">Product limits are unlimited; security protections remain active.</p></div></div>}

      <section className="soft-card flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-muted">Current plan</p>
          <h2 className="mt-1 text-2xl font-semibold text-text-primary">{subscription ? PLAN_LABELS[subscription.plan.slug] : "No active plan"}</h2>
          <p className="mt-1 text-sm text-text-muted">{subscription?.status === "trialing" && subscription.trial_ends_at ? `Trial ends ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(subscription.trial_ends_at))}` : subscription ? `Status: ${subscription.status}` : "Contact support to initialize billing."}</p>
        </div>
        <Button type="button" onClick={manageBilling} isLoading={pending}>{pending ? "Opening…" : "Manage billing"}<ExternalLinkIcon size={14} /></Button>
      </section>
      {message && <p className="text-sm text-text-secondary" role="status">{message}</p>}

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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{overview.plans.map((plan) => <div key={plan.id} className="soft-card-sm p-4"><p className="font-semibold text-text-primary">{PLAN_LABELS[plan.slug]}</p><p className="mt-1 text-sm text-text-muted">{Number(plan.price_monthly) === 0 ? "Free" : `${new Intl.NumberFormat("en", { style: "currency", currency: plan.currency, maximumFractionDigits: 0 }).format(Number(plan.price_monthly))} / month`}</p><Button type="button" variant="secondary" disabled className="mt-4 w-full">{subscription?.plan_id === plan.id ? "Current plan" : "Upgrade coming soon"}</Button></div>)}</div>
      </section>
    </div>
  );
}
