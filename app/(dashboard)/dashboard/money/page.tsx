import { getDictionary } from "@/shared/i18n/get-dictionary";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { getMoneySummary } from "@/modules/moneyflow/queries/get-money-summary";
import { getAccountsWithBalances } from "@/modules/moneyflow/queries/get-accounts-with-balances";
import { getCategories } from "@/modules/moneyflow/queries/get-categories";
import { getTransactions } from "@/modules/moneyflow/queries/get-transactions";
import { getPlannedTransactions } from "@/modules/moneyflow/queries/get-planned-transactions";
import { getExpenseBreakdown } from "@/modules/moneyflow/queries/get-expense-breakdown";
import { getSubscriptions } from "@/modules/subtracker/queries/get-subscriptions";
import { MoneySummaryCards } from "@/modules/moneyflow/components/money-summary-cards";
import { MoneyCreateButtons } from "@/modules/moneyflow/components/money-create-buttons";
import { MoneyRecentTransactions } from "@/modules/moneyflow/components/money-recent-transactions";
import { PlannedTransactions } from "@/modules/moneyflow/components/planned-transactions";
import { MoneyAccountsList } from "@/modules/moneyflow/components/money-accounts-list";
import { MoneyEmptyState } from "@/modules/moneyflow/components/money-empty-state";
import { ExpenseBreakdown } from "@/modules/moneyflow/components/expense-breakdown";
import { ExpenseQuestion } from "@/modules/moneyflow/components/expense-question";
import { MonthNavigator } from "@/modules/moneyflow/components/month-navigator";
import { resolveMonthRange } from "@/modules/moneyflow/lib/month-range";

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  // Dict + locale first: the month label is locale-formatted (e.g. "июнь 2026").
  const { dict, locale } = await getDictionary();
  const range = resolveMonthRange(month, new Date(), locale === "ru" ? "ru-RU" : "en-US");
  const monthWindow = { monthStart: range.monthStart, nextMonthStart: range.nextMonthStart };

  const ctx = await requireOrg();
  const [summary, accounts, categories, transactions, planned, subscriptions, breakdown] =
    await Promise.all([
      getMoneySummary(monthWindow),
      getAccountsWithBalances(ctx.org.id),
      getCategories(ctx.org.id),
      getTransactions(ctx.org.id, { limit: 20, ...monthWindow }),
      getPlannedTransactions(ctx.org.id),
      getSubscriptions(ctx.org.id),
      getExpenseBreakdown(monthWindow),
    ]);

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            {dict.money.title}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {dict.money.description}
          </p>
        </div>
        <MoneyCreateButtons
          dict={dict}
          defaultCurrency={ctx.org.baseCurrency}
          accounts={accounts}
          categories={categories}
          subscriptions={subscriptions}
        />
      </div>

      {/* Month history navigator — scopes the monthly metrics, breakdown and
          transactions below. Balance/Accounts stay live (current totals). */}
      <section className="mt-6">
        <MonthNavigator range={range} dict={dict} />
      </section>

      {/* Summary Cards */}
      <section className="mt-4">
        <MoneySummaryCards summary={summary} dict={dict} />
      </section>

      {/* Accounts List */}
      {accounts.length > 0 && (
        <section className="mt-8">
          <MoneyAccountsList accounts={accounts} dict={dict} />
        </section>
      )}

      {/* Planned (drafts awaiting confirmation — incl. document extractions) */}
      {planned.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
            {dict.money.planned.title}
          </h2>
          <PlannedTransactions
            planned={planned}
            accounts={accounts}
            dict={dict}
            canDelete={canDo(ctx, "data.delete")}
          />
        </section>
      )}

      {/* Transactions for the selected month or Empty State */}
      <section className="mt-8">
        {transactions.length > 0 ? (
          <MoneyRecentTransactions
            transactions={transactions}
            accounts={accounts}
            categories={categories}
            dict={dict}
            canDelete={canDo(ctx, "data.delete")}
            heading={range.isCurrent ? undefined : `${dict.money.history.transactions} · ${range.label}`}
          />
        ) : range.isCurrent ? (
          planned.length === 0 && (
            <MoneyEmptyState
              title={dict.money.empty.title}
              description={dict.money.empty.description}
            />
          )
        ) : (
          <div>
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
              {dict.money.history.transactions} · {range.label}
            </h2>
            <p className="soft-card-sm p-5 text-sm text-text-muted">
              {dict.money.history.noTransactions} {range.label}.
            </p>
          </div>
        )}
      </section>

      <ExpenseBreakdown
        breakdown={breakdown}
        monthLabel={range.label}
        labels={dict.money.breakdown}
        locale={locale}
      />
      <ExpenseQuestion
        labels={dict.money.question}
        month={{ monthStart: range.monthStart, nextMonthStart: range.nextMonthStart, label: range.label }}
      />
    </>
  );
}
