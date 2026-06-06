import { getDictionary } from "@/shared/i18n/get-dictionary";
import { getSubSummary } from "@/modules/subtracker/queries/get-sub-summary";
import { getSubscriptions } from "@/modules/subtracker/queries/get-subscriptions";
import { getUpcomingRenewals } from "@/modules/subtracker/queries/get-upcoming-renewals";
import { SubSummaryCards } from "@/modules/subtracker/components/sub-summary-cards";
import { SubUpcomingRenewals } from "@/modules/subtracker/components/sub-upcoming-renewals";
import { SubList } from "@/modules/subtracker/components/sub-list";
import { SubCreateButton } from "@/modules/subtracker/components/sub-create-button";
import { SubEmptyState } from "@/modules/subtracker/components/sub-empty-state";

/**
 * SubTracker Page — /dashboard/subscriptions
 *
 * Форма создания скрыта по умолчанию.
 * Кнопка "Create Record" открывает модальное окно с формой.
 * После успешного создания — модалка закрывается автоматически.
 */
export default async function SubscriptionsPage() {
  const [summary, subscriptions, upcoming, { dict }] = await Promise.all([
    getSubSummary(),
    getSubscriptions(),
    getUpcomingRenewals(),
    getDictionary(),
  ]);

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
        <SubCreateButton dict={dict} />
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
            <SubList subscriptions={subscriptions} dict={dict} />
          </>
        ) : (
          <SubEmptyState
            title={dict.subscriptions.empty.title}
            description={dict.subscriptions.empty.description}
          />
        )}
      </section>
    </>
  );
}
