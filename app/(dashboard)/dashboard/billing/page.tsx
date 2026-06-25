import {
  CreditCardIcon,
  CheckIcon,
  AlertTriangleIcon,
  ReceiptIcon,
  ZapIcon,
} from "lucide-react";
import { ChangePlanForm } from "@/features/billing/components/change-plan-form";
import { requireOrg } from "@/lib/auth/require-org";
import {
  getSubscription,
  getPlans,
  getUsageSummary,
  getInvoices,
  PLAN_LABELS,
  SUBSCRIPTION_STATUS_STYLES,
  INVOICE_STATUS_STYLES,
  USAGE_METRIC_LABELS,
  UNLIMITED,
} from "@/modules/billing";
import type {
  SubscriptionWithPlan,
  Plan,
  UsageSummary,
  Invoice,
} from "@/modules/billing";

export default async function BillingPage() {
  const { org } = await requireOrg();

  const subscription = await getSubscription(org.id);

  if (!subscription) {
    return <NoSubscriptionState />;
  }

  const [plans, usage, invoices] = await Promise.all([
    getPlans(),
    getUsageSummary(org.id, subscription.plan),
    getInvoices(org.id),
  ]);

  return (
    <>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Billing</h1>
        <p className="mt-1 text-sm text-text-muted">
          Manage your plan and usage
        </p>
      </div>

      {/* Current plan card */}
      <section className="mt-6">
        <CurrentPlanCard
          subscription={subscription}
          memberUsage={usage.find((item) => item.metric === "members")?.used ?? 0}
        />
      </section>

      {/* Usage */}
      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Usage
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {usage.map((u) => (
            <UsageRow key={u.metric} item={u} />
          ))}
        </div>
      </section>

      {/* Upgrade plans */}
      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Plans
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={plan.id === subscription.plan_id}
            />
          ))}
        </div>
      </section>

      {/* Invoices */}
      {invoices.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Invoice History
          </h2>
          <InvoiceList invoices={invoices} />
        </section>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

function CurrentPlanCard({
  subscription,
  memberUsage,
}: {
  subscription: SubscriptionWithPlan;
  memberUsage: number;
}) {
  const { plan, status, billing_cycle, current_period_end, cancel_at_period_end } = subscription;
  const statusCls = SUBSCRIPTION_STATUS_STYLES[status] ?? SUBSCRIPTION_STATUS_STYLES.active;
  const periodEnd = new Date(current_period_end).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
  const basePrice = Number(billing_cycle === "yearly" ? plan.price_yearly : plan.price_monthly);
  const extraSeats = Math.max(0, memberUsage - Number(plan.included_members));
  const totalPrice = basePrice + extraSeats * Number(plan.extra_member_price);
  const price = new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: plan.currency,
    maximumFractionDigits: 0,
  }).format(totalPrice);

  return (
    <div className="soft-card-sm p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CreditCardIcon size={16} className="text-text-muted" />
            <span className="text-xs text-text-muted">Current plan</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {PLAN_LABELS[plan.slug]}
          </p>
          <p className="mt-0.5 text-sm text-text-muted">
            {basePrice === 0
              ? "14-day trial"
              : `${price} / ${billing_cycle === "yearly" ? "year" : "month"}`}
          </p>
          {Number(plan.extra_member_price) > 0 && (
            <p className="mt-1 text-xs text-text-muted">
              {plan.included_members} included member · {new Intl.NumberFormat("en-IE", {
                style: "currency", currency: plan.currency, maximumFractionDigits: 0,
              }).format(Number(plan.extra_member_price))} per additional member · {memberUsage} of {plan.max_members} used
            </p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusCls}`}>
          {status}
        </span>
      </div>

      {cancel_at_period_end && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
          <AlertTriangleIcon size={13} />
          Cancels at end of period · {periodEnd}
        </div>
      )}

      {!cancel_at_period_end && (
        <p className="mt-3 text-xs text-text-muted">
          Next billing: {periodEnd}
        </p>
      )}
    </div>
  );
}

function UsageRow({ item }: { item: UsageSummary }) {
  const isUnlimited = item.limit === UNLIMITED;
  const isWarning   = !isUnlimited && item.pct >= 80;
  const isOver      = item.isOverLimit;

  const barColor = isOver
    ? "bg-red-500"
    : isWarning
    ? "bg-accent-yellow"
    : "bg-accent-green";

  return (
    <div className="soft-card-sm p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted">{USAGE_METRIC_LABELS[item.metric]}</span>
        <span className={isOver ? "font-medium text-red-500" : "text-text-secondary"}>
          {item.used}
          {!isUnlimited && ` / ${item.limit}`}
          {isUnlimited && " / ∞"}
        </span>
      </div>
      {!isUnlimited && (
        <div className="mt-2 h-1.5 w-full rounded-full bg-surface-secondary">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(item.pct, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, isCurrent }: { plan: Plan; isCurrent: boolean }) {
  const features = plan.features as Record<string, boolean>;

  return (
    <div
      className={`soft-card-sm flex flex-col p-4 ${
        isCurrent ? "ring-2 ring-accent-green" : ""
      }`}
    >
      {isCurrent && (
        <span className="mb-2 self-start rounded-full bg-accent-green-soft px-2 py-0.5 text-[10px] font-medium text-accent-green">
          Current
        </span>
      )}
      <p className="text-base font-semibold text-text-primary">
        {PLAN_LABELS[plan.slug]}
      </p>
      <p className="mt-0.5 text-xl font-bold text-text-primary">
        {plan.price_monthly === 0 ? "Free" : `$${plan.price_monthly}`}
        {plan.price_monthly > 0 && (
          <span className="text-xs font-normal text-text-muted"> /mo</span>
        )}
      </p>
      <p className="mt-1 text-xs text-text-muted">{plan.description}</p>

      <ul className="mt-3 flex flex-col gap-1">
        {Object.entries(features)
          .filter(([, v]) => v)
          .map(([key]) => (
            <li key={key} className="flex items-center gap-1.5 text-xs text-text-secondary">
              <CheckIcon size={11} className="shrink-0 text-accent-green" />
              {key.replace(/_/g, " ")}
            </li>
          ))}
      </ul>

      {!isCurrent && (
        <ChangePlanForm planName={PLAN_LABELS[plan.slug]} />
      )}
    </div>
  );
}

function InvoiceList({ invoices }: { invoices: Invoice[] }) {
  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
  });

  return (
    <div className="flex flex-col gap-2">
      {invoices.map((inv) => {
        const statusCls = INVOICE_STATUS_STYLES[inv.status] ?? INVOICE_STATUS_STYLES.draft;
        return (
          <div key={inv.id} className="soft-card-sm flex items-center gap-4 p-3">
            <ReceiptIcon size={15} className="shrink-0 text-text-muted" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">
                {fmt.format(inv.amount)}
              </p>
              <p className="text-xs text-text-muted">
                {new Date(inv.created_at).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric",
                })}
                {inv.billing_reason && ` · ${inv.billing_reason.replace(/_/g, " ")}`}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusCls}`}>
              {inv.status}
            </span>
            {inv.pdf_url && (
              <a
                href={inv.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs text-blue-500 hover:underline"
              >
                PDF
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NoSubscriptionState() {
  return (
    <div className="mt-16 flex flex-col items-center gap-3 text-center">
      <ZapIcon size={36} className="text-text-muted opacity-40" />
      <p className="text-sm font-medium text-text-primary">No subscription found</p>
      <p className="max-w-xs text-xs text-text-muted">
        Your organization does not have an active subscription yet.
      </p>
    </div>
  );
}
