import { getDictionary } from "@/shared/i18n/get-dictionary";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { getMoneySummary } from "@/modules/moneyflow/queries/get-money-summary";
import { getAccounts } from "@/modules/moneyflow/queries/get-accounts";
import { getCategories } from "@/modules/moneyflow/queries/get-categories";
import { getTransactions } from "@/modules/moneyflow/queries/get-transactions";
import { getSubscriptions } from "@/modules/subtracker/queries/get-subscriptions";
import { MoneySummaryCards } from "@/modules/moneyflow/components/money-summary-cards";
import { MoneyCreateButtons } from "@/modules/moneyflow/components/money-create-buttons";
import { MoneyRecentTransactions } from "@/modules/moneyflow/components/money-recent-transactions";
import { MoneyAccountsList } from "@/modules/moneyflow/components/money-accounts-list";
import { MoneyEmptyState } from "@/modules/moneyflow/components/money-empty-state";

export default async function MoneyPage() {
  const ctx = await requireOrg();
  const [summary, accounts, categories, transactions, subscriptions, { dict }] =
    await Promise.all([
      getMoneySummary(),
      getAccounts(),
      getCategories(),
      getTransactions({ limit: 20 }),
      getSubscriptions(),
      getDictionary(),
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

      {/* Summary Cards */}
      <section className="mt-6">
        <MoneySummaryCards summary={summary} dict={dict} />
      </section>

      {/* Accounts List */}
      {accounts.length > 0 && (
        <section className="mt-8">
          <MoneyAccountsList accounts={accounts} dict={dict} />
        </section>
      )}

      {/* Recent Transactions or Empty State */}
      <section className="mt-8">
        {transactions.length > 0 ? (
          <MoneyRecentTransactions
            transactions={transactions}
            accounts={accounts}
            categories={categories}
            dict={dict}
            canDelete={canDo(ctx, "data.delete")}
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
