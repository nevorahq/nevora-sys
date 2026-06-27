import { ArrowUpRightIcon, ArrowDownLeftIcon } from "lucide-react";
import { TransactionItem } from "./transaction-item";
import { cn } from "@/shared/utils/cn";
import { formatDate } from "@/shared/utils/format-date";
import { formatMoney } from "@/shared/utils/format-money";
import type { MoneyAccount, MoneyCategory, MoneyTransactionWithRelations } from "../types/moneyflow.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface MoneyRecentTransactionsProps {
  transactions: MoneyTransactionWithRelations[];
  accounts?: MoneyAccount[];
  categories?: MoneyCategory[];
  dict: Dictionary;
  canDelete?: boolean;
}

export function MoneyRecentTransactions({
  transactions,
  accounts,
  categories,
  dict,
  canDelete = false,
}: MoneyRecentTransactionsProps) {
  const editable = accounts !== undefined && categories !== undefined;

  return (
    <div>
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        {dict.money.transactions.recent}
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
            <TransactionReadOnly key={tx.id} transaction={tx} />
          ),
        )}
      </div>
    </div>
  );
}

function TransactionReadOnly({ transaction: tx }: { transaction: MoneyTransactionWithRelations }) {
  const isIncome = tx.type === "income";

  return (
    <div className="soft-card-sm flex items-center gap-3 p-4">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-(--neu-radius-md)",
          isIncome ? "bg-accent-green-soft" : "bg-accent-pink-soft",
        )}
      >
        {isIncome ? (
          <ArrowDownLeftIcon size={18} className="text-accent-green" strokeWidth={2} />
        ) : (
          <ArrowUpRightIcon size={18} className="text-accent-pink" strokeWidth={2} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{tx.title}</p>
        <p className="text-xs text-text-muted truncate">
          {tx.category?.name ?? "—"}
          {tx.account?.name ? ` · ${tx.account.name}` : ""}
        </p>
      </div>

      <div className="text-right shrink-0">
        <p
          className={cn(
            "text-sm font-semibold tabular-nums",
            isIncome ? "text-accent-green" : "text-text-primary",
          )}
        >
          {isIncome ? "+" : "−"}
          {formatMoney(Number(tx.amount))}
        </p>
        <p className="text-xs text-text-muted">{formatDate(tx.transaction_date)}</p>
      </div>
    </div>
  );
}
