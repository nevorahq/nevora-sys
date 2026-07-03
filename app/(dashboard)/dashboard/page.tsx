import Link from "next/link";
import { ArrowRightIcon, AlertTriangleIcon } from "lucide-react";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { requireOrg } from "@/lib/auth/require-org";
import { getTaskSummary } from "@/features/todos/queries/get-task-summary";
import { getMoneySummary } from "@/modules/moneyflow/queries/get-money-summary";
import { getTransactions } from "@/modules/moneyflow/queries/get-transactions";
import { getSubSummary } from "@/modules/subtracker/queries/get-sub-summary";
import { getUpcomingRenewals } from "@/modules/subtracker/queries/get-upcoming-renewals";
import { TaskSummaryCards } from "@/features/todos/components/task-summary-cards";
import { MoneySummaryCards } from "@/modules/moneyflow/components/money-summary-cards";
import { MoneyRecentTransactions } from "@/modules/moneyflow/components/money-recent-transactions";
import { MoneyEmptyState } from "@/modules/moneyflow/components/money-empty-state";
import { SubSummaryCards } from "@/modules/subtracker/components/sub-summary-cards";
import { ROUTES } from "@/shared/config/routes";
import { getNotificationCounters } from "@/modules/notifications/queries/get-notification-counters";
import { ObligationSummary } from "@/modules/notifications/components/obligation-summary";

/**
 * Dashboard Overview — /dashboard
 *
 * Агрегатор: вызывает summary queries из каждого модуля.
 * Каждый модуль предоставляет:
 * - getTaskSummary() → features/todos/
 * - getMoneySummary() → modules/moneyflow/
 * - getSubSummary() + getUpcomingRenewals() → modules/subtracker/
 */
export default async function DashboardPage() {
  const { org } = await requireOrg();
  const [
    taskSummary,
    moneySummary,
    recentTransactions,
    subSummary,
    upcomingRenewals,
    notificationCounters,
    { dict },
  ] = await Promise.all([
    getTaskSummary(org.id),
    getMoneySummary(),
    getTransactions(org.id, { limit: 5 }),
    getSubSummary(org.id),
    getUpcomingRenewals(org.id),
    getNotificationCounters(),
    getDictionary(),
  ]);

  return (
    <>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          {dict.dashboard.title}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {dict.dashboard.subtitle}
        </p>
      </div>

      <ObligationSummary counters={notificationCounters} />

      {/* ── Upcoming Renewals Alert ── */}
      {upcomingRenewals.length > 0 && (
        <section className="mt-6">
          <div className="soft-card-sm flex items-center gap-3 p-4 border-accent-yellow/30 border">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-(--neu-radius-md) bg-accent-yellow-soft">
              <AlertTriangleIcon size={18} className="text-accent-yellow" strokeWidth={2} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">
                {upcomingRenewals.length} {dict.subscriptions.dashboard.upcoming}
              </p>
            </div>
            <Link
              href={ROUTES.subscriptions}
              className="flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
            >
              {dict.dashboard.viewAll}
              <ArrowRightIcon size={14} />
            </Link>
          </div>
        </section>
      )}

      {/* ── MoneyFlow Summary ── */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            {dict.dashboard.taskSummary.title}
          </h2>
          <Link
            href={ROUTES.tasks}
            className="flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
          >
            {dict.dashboard.viewAll}
            <ArrowRightIcon size={14} />
          </Link>
        </div>
        <TaskSummaryCards summary={taskSummary} dict={dict} />
      </section>

      {/* ── MoneyFlow Summary ── */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            {dict.dashboard.moneySummary.title}
          </h2>
          <Link
            href={ROUTES.money}
            className="flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
          >
            {dict.dashboard.viewAll}
            <ArrowRightIcon size={14} />
          </Link>
        </div>
        <MoneySummaryCards summary={moneySummary} dict={dict} />
      </section>

      {/* ── SubTracker Summary ── */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            {dict.subscriptions.dashboard.title}
          </h2>
          <Link
            href={ROUTES.subscriptions}
            className="flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
          >
            {dict.dashboard.viewAll}
            <ArrowRightIcon size={14} />
          </Link>
        </div>
        <SubSummaryCards summary={subSummary} dict={dict} />
      </section>

      {/* ── Recent Transactions ── */}
      <section className="mt-8">
        {recentTransactions.length > 0 ? (
          <MoneyRecentTransactions
            transactions={recentTransactions}
            dict={dict}
          />
        ) : (
          <MoneyEmptyState
            title={dict.money.empty.title}
            description={dict.money.empty.description}
          />
        )}
      </section>
    </>
  );
}
