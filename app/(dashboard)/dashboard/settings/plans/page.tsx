import { CheckIcon, XIcon } from "lucide-react";
import { requireOrg } from "@/lib/auth/require-org";
import { getPlans, getSubscription } from "@/modules/billing";
import { SettingsHeader } from "@/modules/settings/components/SettingsHeader";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

function formatLimit(value: number, unlimited: string, unit = "") {
  if (value === -1) return unlimited;
  return `${new Intl.NumberFormat("en").format(value)}${unit}`;
}

function storageLabel(mb: number, unlimited: string) {
  if (mb === -1) return unlimited;
  if (mb >= 1024) return `${Math.round(mb / 1024)} GB`;
  return `${mb} MB`;
}

function FeatureState({ enabled, t }: { enabled: boolean; t: Dictionary["settings"]["plans"] }) {
  return enabled ? (
    <span className="inline-flex items-center gap-1 text-accent-green"><CheckIcon size={15} /> {t.yes}</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-text-muted"><XIcon size={15} /> {t.no}</span>
  );
}

export default async function PlansSettingsPage() {
  const ctx = await requireOrg();
  const [plans, subscription, { dict }] = await Promise.all([
    getPlans(),
    getSubscription(ctx.org.id),
    getDictionary(),
  ]);
  const t = dict.settings.plans;
  const header = dict.settings.header;

  return (
    <div className="space-y-5">
      <SettingsHeader title={header.plansTitle} description={header.plansDescription} />
      <div className="grid gap-4 lg:grid-cols-4">
        {plans.map((plan) => {
          const features = plan.features ?? {};
          const isCurrent = subscription?.plan_id === plan.id;
          return (
            <section key={plan.id} className="soft-card-sm flex flex-col gap-4 p-5">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-text-primary">{plan.name}</h2>
                  {isCurrent && <span className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-text-secondary">{t.current}</span>}
                </div>
                <p className="mt-1 min-h-10 text-sm text-text-muted">{plan.description}</p>
                <p className="mt-4 text-2xl font-semibold text-text-primary">
                  {Number(plan.price_monthly) === 0
                    ? t.free
                    : new Intl.NumberFormat("en", { style: "currency", currency: plan.currency, maximumFractionDigits: 0 }).format(Number(plan.price_monthly))}
                  {Number(plan.price_monthly) > 0 && <span className="text-sm font-medium text-text-muted"> {t.perMonth}</span>}
                </p>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-text-muted">{t.members}</dt><dd className="font-medium text-text-primary">{formatLimit(plan.max_members, t.unlimited)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-text-muted">{t.storage}</dt><dd className="font-medium text-text-primary">{storageLabel(plan.max_storage_mb, t.unlimited)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-text-muted">{t.tasks}</dt><dd className="font-medium text-text-primary">{formatLimit(plan.max_tasks, t.unlimited)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-text-muted">{t.documents}</dt><dd className="font-medium text-text-primary">{formatLimit(plan.max_documents, t.unlimited)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-text-muted">{t.moneyTransactions}</dt><dd className="font-medium text-text-primary">{formatLimit(plan.max_money_transactions, t.unlimited)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-text-muted">{t.subscriptions}</dt><dd className="font-medium text-text-primary">{formatLimit(plan.max_subscriptions, t.unlimited)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-text-muted">{t.aiRequests}</dt><dd className="font-medium text-text-primary">{formatLimit(plan.max_ai_calls_mo, t.unlimited)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-text-muted">{t.developerAccess}</dt><dd className="font-medium"><FeatureState enabled={features["developer_access.enabled"] === true} t={t} /></dd></div>
              </dl>
            </section>
          );
        })}
      </div>
    </div>
  );
}
