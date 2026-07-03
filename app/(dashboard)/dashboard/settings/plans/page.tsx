import { CheckIcon, XIcon } from "lucide-react";
import { requireOrg } from "@/lib/auth/require-org";
import { getPlans, getSubscription } from "@/modules/billing";
import { SettingsHeader } from "@/modules/settings/components/SettingsHeader";

function formatLimit(value: number, unit = "") {
  if (value === -1) return "Unlimited";
  return `${new Intl.NumberFormat("en").format(value)}${unit}`;
}

function storageLabel(mb: number) {
  if (mb === -1) return "Unlimited";
  if (mb >= 1024) return `${Math.round(mb / 1024)} GB`;
  return `${mb} MB`;
}

function FeatureState({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <span className="inline-flex items-center gap-1 text-accent-green"><CheckIcon size={15} /> Yes</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-text-muted"><XIcon size={15} /> No</span>
  );
}

export default async function PlansSettingsPage() {
  const ctx = await requireOrg();
  const [plans, subscription] = await Promise.all([
    getPlans(),
    getSubscription(ctx.org.id),
  ]);

  return (
    <div className="space-y-5">
      <SettingsHeader title="Plans" description="Compare database-backed plan limits and feature access." />
      <div className="grid gap-4 lg:grid-cols-4">
        {plans.map((plan) => {
          const features = plan.features ?? {};
          const isCurrent = subscription?.plan_id === plan.id;
          return (
            <section key={plan.id} className="soft-card-sm flex flex-col gap-4 p-5">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-text-primary">{plan.name}</h2>
                  {isCurrent && <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-text-secondary">Current</span>}
                </div>
                <p className="mt-1 min-h-10 text-sm text-text-muted">{plan.description}</p>
                <p className="mt-4 text-2xl font-semibold text-text-primary">
                  {Number(plan.price_monthly) === 0
                    ? "Free"
                    : new Intl.NumberFormat("en", { style: "currency", currency: plan.currency, maximumFractionDigits: 0 }).format(Number(plan.price_monthly))}
                  {Number(plan.price_monthly) > 0 && <span className="text-sm font-medium text-text-muted"> / month</span>}
                </p>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-text-muted">Members</dt><dd className="font-medium text-text-primary">{formatLimit(plan.max_members)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-text-muted">Storage</dt><dd className="font-medium text-text-primary">{storageLabel(plan.max_storage_mb)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-text-muted">Tasks</dt><dd className="font-medium text-text-primary">{formatLimit(plan.max_tasks)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-text-muted">Documents</dt><dd className="font-medium text-text-primary">{formatLimit(plan.max_documents)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-text-muted">Money transactions</dt><dd className="font-medium text-text-primary">{formatLimit(plan.max_money_transactions)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-text-muted">Subscriptions</dt><dd className="font-medium text-text-primary">{formatLimit(plan.max_subscriptions)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-text-muted">AI requests</dt><dd className="font-medium text-text-primary">{formatLimit(plan.max_ai_calls_mo)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-text-muted">Developer access</dt><dd className="font-medium"><FeatureState enabled={features["developer_access.enabled"] === true} /></dd></div>
              </dl>
            </section>
          );
        })}
      </div>
    </div>
  );
}
