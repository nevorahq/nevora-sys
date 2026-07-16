import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CalendarIcon, CoinsIcon, LandmarkIcon, WalletCardsIcon } from "lucide-react";
import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import { MoneyRecentTransactions } from "@/modules/moneyflow/components/money-recent-transactions";
import type { MoneyTransactionWithRelations } from "@/modules/moneyflow/types/moneyflow.types";
import { ROUTES } from "@/shared/config/routes";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { formatDate } from "@/shared/utils/format-date";
import { formatMoney } from "@/shared/utils/format-money";

export default async function MoneyAccountDetailPage({
  params,
}: PageProps<"/dashboard/money/accounts/[accountId]">) {
  const { accountId } = await params;
  const [{ org }, { dict }] = await Promise.all([requireOrg(), getDictionary()]);
  const supabase = await createClient();

  const [
    { data: account },
    { data: transactions, error: transactionsError },
    { data: ledgerEntries, error: ledgerError },
  ] = await Promise.all([
    supabase
      .from("money_accounts")
      .select("id, name, type, initial_balance, currency, created_at")
      .eq("id", accountId)
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("money_transactions")
      // money_accounts is referenced by 3 FKs now — disambiguate `account` by
      // its column and also embed from/to names for transfer rows. `.or` pulls
      // in transfers where this account is the destination, not only account_id.
      .select(
        "*, account:money_accounts!account_id(name), category:money_categories(name), from_account:money_accounts!from_account_id(name), to_account:money_accounts!to_account_id(name)",
      )
      .or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
      .eq("organization_id", org.id)
      .eq("status", "posted")
      .is("deleted_at", null)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("money_transactions")
      .select("amount, destination_amount, type, to_account_id")
      .or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
      .eq("organization_id", org.id)
      .eq("status", "posted")
      .is("deleted_at", null),
  ]);

  if (!account) notFound();

  const accountTransactions = transactionsError
    ? []
    : (transactions as MoneyTransactionWithRelations[] | null) ?? [];
  if (transactionsError) console.error("account detail transactions error:", transactionsError);
  if (ledgerError) console.error("account detail balance error:", ledgerError);
  const currentBalance = ledgerError
    ? null
    : (ledgerEntries ?? []).reduce((balance, transaction) => {
        const amount = Number(transaction.amount);
        if (transaction.type === "transfer") {
          // Destination side adds, source side subtracts.
          return transaction.to_account_id === accountId
            ? balance + Number(transaction.destination_amount ?? transaction.amount)
            : balance - amount;
        }
        return transaction.type === "income" ? balance + amount : balance - amount;
      }, Number(account.initial_balance));
  const accountType = account.type as keyof typeof dict.money.accounts.types;

  return (
    <>
      <header className="mb-6">
        <Link
          href={ROUTES.money}
          className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"
        >
          <ArrowLeftIcon size={16} /> {dict.money.title}
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-(--neu-radius-md) bg-accent-lilac-soft">
              <LandmarkIcon size={21} className="text-accent-lilac" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-text-primary">{account.name}</h1>
              <p className="mt-1 text-sm text-text-muted">
                {dict.money.accounts.types[accountType]} · {account.currency}
              </p>
            </div>
          </div>
          <span className="rounded-full bg-accent-lilac-soft px-3 py-1 text-sm font-semibold text-accent-lilac">
            {currentBalance === null ? "—" : `${formatMoney(currentBalance)} ${account.currency}`}
          </span>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="space-y-6">
          <section className="soft-card p-5 sm:p-6">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
              <CoinsIcon size={14} /> {dict.money.accounts.initialBalance}
            </p>
            <p className="mt-3 text-xl font-semibold tabular-nums text-text-primary">
              {formatMoney(Number(account.initial_balance))} {account.currency}
            </p>
          </section>

          {accountTransactions.length > 0 ? (
            <MoneyRecentTransactions transactions={accountTransactions} dict={dict} />
          ) : (
            <div className="soft-card p-6 text-center text-sm text-text-muted">
              {dict.money.empty.title}
            </div>
          )}
        </main>

        <aside className="space-y-4">
          <section className="soft-card-sm space-y-4 p-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                <WalletCardsIcon size={13} /> {dict.money.accounts.typeLabel}
              </p>
              <p className="mt-2 text-sm text-text-primary">
                {dict.money.accounts.types[accountType]}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                <CoinsIcon size={13} /> {dict.onboarding.currencyLabel}
              </p>
              <p className="mt-2 text-sm text-text-primary">{account.currency}</p>
            </div>
            <div>
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                <CalendarIcon size={13} /> {dict.money.transactions.dateLabel}
              </p>
              <p className="mt-2 text-sm text-text-primary">{formatDate(account.created_at)}</p>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
