import Link from "next/link";
import { ArrowUpRightIcon, ArrowDownLeftIcon, ArrowRightLeftIcon } from "lucide-react";
import { TransactionItem } from "./transaction-item";
import { ROUTES } from "@/shared/config/routes";
import { cn } from "@/shared/utils/cn";
import { formatDate, formatTime } from "@/shared/utils/format-date";
import { formatMoney } from "@/shared/utils/format-money";
import type { MoneyAccount, MoneyCategory, MoneyTransactionWithRelations } from "../types/moneyflow.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface MoneyRecentTransactionsProps {
  transactions: MoneyTransactionWithRelations[];
  accounts?: MoneyAccount[];
  categories?: MoneyCategory[];
  dict: Dictionary;
  canDelete?: boolean;
  /** Overrides the default "Recent" heading (e.g. a past-month label). */
  heading?: string;
}

export function MoneyRecentTransactions({
  transactions,
  accounts,
  categories,
  dict,
  canDelete = false,
  heading,
}: MoneyRecentTransactionsProps) {
  const editable = accounts !== undefined && categories !== undefined;

  return (
    <div>
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        {heading ?? dict.money.transactions.recent}
      </h2>

      <div className="flex flex-col gap-2.5">
        {transactions.map((tx) =>
          editable ? (
            <TransactionItem
              key={tx.id}
              transaction={tx}
              accounts={accounts}
              categories={categories}
              dict={dict}
              canDelete={canDelete}
            />
          ) : (
            <TransactionReadOnly key={tx.id} transaction={tx} dict={dict} />
          ),
        )}
      </div>
    </div>
  );
}

function TransactionReadOnly({
  transaction: tx,
  dict,
}: {
  transaction: MoneyTransactionWithRelations;
  dict: Dictionary;
}) {
  const isTransfer = tx.type === "transfer";
  const isIncome = tx.type === "income";

  const subtitle = isTransfer
    ? `${tx.from_account?.name ?? "—"} → ${tx.to_account?.name ?? "—"}`
    : `${tx.category?.name ?? "—"}${tx.account?.name ? ` · ${tx.account.name}` : ""}`;

  return (
    <Link
      href={`${ROUTES.money}/${tx.id}`}
      className="soft-card-sm flex items-center gap-3 p-4 transition-shadow hover:shadow-neu-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      aria-label={`Open transaction: ${tx.title}`}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-(--neu-radius-md)",
          isTransfer ? "bg-surface-sunken" : isIncome ? "bg-accent-green-soft" : "bg-accent-pink-soft",
        )}
      >
        {isTransfer ? (
          <ArrowRightLeftIcon size={18} className="text-text-secondary" strokeWidth={2} />
        ) : isIncome ? (
          <ArrowDownLeftIcon size={18} className="text-accent-green" strokeWidth={2} />
        ) : (
          <ArrowUpRightIcon size={18} className="text-accent-pink" strokeWidth={2} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">
          {isTransfer ? dict.money.transfer.label : tx.title}
        </p>
        <p className="text-xs text-text-muted truncate">{subtitle}</p>
      </div>

      <div className="text-right shrink-0">
        <p
          className={cn(
            "text-sm font-semibold tabular-nums",
            isTransfer ? "text-text-secondary" : isIncome ? "text-accent-green" : "text-text-primary",
          )}
        >
          {isTransfer ? "" : isIncome ? "+" : "−"}
          {formatMoney(Number(tx.amount))}
        </p>
        <p className="text-xs text-text-muted" suppressHydrationWarning>
          {formatDate(tx.transaction_date)}, {formatTime(tx.created_at)}
        </p>
      </div>
    </Link>
  );
}
