"use client";

import { useTransition } from "react";
import { CalendarClockIcon, CheckIcon } from "lucide-react";
import { postPlannedTransactionAction } from "../actions/post-planned-transaction.action";
import { DeleteTransactionButton } from "./delete-transaction-button";
import { formatMoney } from "@/shared/utils/format-money";
import { formatDate } from "@/shared/utils/format-date";
import { cn } from "@/shared/utils/cn";
import type { MoneyTransactionWithRelations } from "../types/moneyflow.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface PlannedTransactionsProps {
  planned: MoneyTransactionWithRelations[];
  dict: Dictionary;
  canDelete: boolean;
}

/**
 * Секция «Запланированные» — отложенные (planned) транзакции.
 * Действия: «Провести» (planned → posted, попадает в баланс) и «Удалить».
 * Рендерится только если есть planned-записи (контролируется страницей).
 */
export function PlannedTransactions({ planned, dict, canDelete }: PlannedTransactionsProps) {
  const t = dict.money.planned;

  return (
    <div className="flex flex-col gap-2">
      {planned.map((tx) => (
        <PlannedRow
          key={tx.id}
          tx={tx}
          t={t}
          dict={dict}
          canDelete={canDelete}
        />
      ))}
    </div>
  );
}

function PlannedRow({
  tx,
  t,
  dict,
  canDelete,
}: {
  tx: MoneyTransactionWithRelations;
  t: Dictionary["money"]["planned"];
  dict: Dictionary;
  canDelete: boolean;
}) {
  const [isPosting, startPost] = useTransition();

  function handlePost() {
    startPost(async () => {
      await postPlannedTransactionAction(tx.id);
    });
  }

  return (
    <div
      className={cn(
        "soft-card-sm flex items-center gap-3 p-4 transition-opacity",
        isPosting && "opacity-50 pointer-events-none",
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-(--neu-radius-md) bg-accent-yellow-soft">
        <CalendarClockIcon size={18} className="text-accent-yellow" strokeWidth={2} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-text-primary">{tx.title}</p>
          <span className="shrink-0 rounded-(--neu-radius-pill) bg-accent-yellow-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-yellow">
            {t.badge}
          </span>
        </div>
        <p className="text-xs text-text-muted">
          {formatDate(tx.transaction_date)}
          {tx.account?.name ? ` · ${tx.account.name}` : ""}
        </p>
      </div>

      <p className="shrink-0 text-sm font-semibold text-text-primary tabular-nums">
        −{formatMoney(Number(tx.amount))}
      </p>

      <button
        type="button"
        onClick={handlePost}
        disabled={isPosting}
        title={t.postButton}
        className="soft-icon-button h-9 w-9 shrink-0 text-accent-green"
      >
        <CheckIcon size={16} strokeWidth={2} />
      </button>

      {canDelete && (
        <DeleteTransactionButton
          transactionId={tx.id}
          transactionTitle={tx.title}
          dict={dict}
          className="h-9 w-9 shrink-0"
        />
      )}
    </div>
  );
}
