import { getDictionary } from "@/shared/i18n/get-dictionary";
import { requireOrg } from "@/lib/auth/require-org";
import { getSubSummary } from "@/modules/subtracker/server";
import { getSubscriptions } from "@/modules/subtracker/server";
import { getUpcomingRenewals } from "@/modules/subtracker/server";
import { getOpenCyclesBySubscription } from "@/modules/subtracker/server";
import { SubSummaryCards } from "@/modules/subtracker/ui";
import { SubUpcomingRenewals } from "@/modules/subtracker/ui";
import { SubList } from "@/modules/subtracker/ui";
import { SubCreateButton } from "@/modules/subtracker/ui";
import { SubEmptyState } from "@/modules/subtracker/ui";

/**
 * Subscriptions Page — /dashboard/subscriptions
 *
 * Форма создания скрыта по умолчанию.
 * Кнопка "Create Record" открывает модальное окно с формой.
 * После успешного создания — модалка закрывается автоматически.
 */
export default async function SubscriptionsPage() {
  const [{ dict }, ctx] = await Promise.all([getDictionary(), requireOrg()]);
  const [summary, subscriptions, upcoming, openCycles] = await Promise.all([
    getSubSummary(ctx.org.id),
    getSubscriptions(ctx.org.id),
    getUpcomingRenewals(ctx.org.id),
    getOpenCyclesBySubscription(ctx.org.id),
  ]);
  const cycleBySub = Object.fromEntries(
    Array.from(openCycles.entries()).map(([subId, c]) => [subId, { status: c.status, due_date: c.due_date }]),
  );

  return (
    <>
      {/* Header + Create Button */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            {dict.subscriptions.title}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {dict.subscriptions.description}
          </p>
        </div>
        <SubCreateButton dict={dict} defaultCurrency={ctx.org.baseCurrency} />
      </div>

      {/* Summary Cards */}
      <section className="mt-6">
        <SubSummaryCards summary={summary} dict={dict} />
      </section>

      {/* Upcoming Renewals */}
      {upcoming.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
            {dict.subscriptions.upcoming.title}
          </h2>
          <SubUpcomingRenewals renewals={upcoming} dict={dict} />
        </section>
      )}

      {/* Subscription List or Empty State */}
      <section className="mt-8">
        {subscriptions.length > 0 ? (
          <>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
              {dict.subscriptions.summary.active}
            </h2>
            <SubList subscriptions={subscriptions} dict={dict} cycleBySub={cycleBySub} />
          </>
        ) : (
          <SubEmptyState dict={dict} defaultCurrency={ctx.org.baseCurrency} />
        )}
      </section>
    </>
  );
}
