"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClockIcon, CheckIcon } from "lucide-react";
import { postPlannedTransactionAction } from "../actions/post-planned-transaction.action";
import { DeleteTransactionButton } from "./delete-transaction-button";
import { RestrictedActionTooltip, useAccessGate } from "@/modules/billing/components/access-state";
import { formatMoney } from "@/shared/utils/format-money";
import { formatDate } from "@/shared/utils/format-date";
import { cn } from "@/shared/utils/cn";
import type { MoneyAccount, MoneyTransactionWithRelations } from "../types/moneyflow.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface PlannedTransactionsProps {
  planned: MoneyTransactionWithRelations[];
  accounts: MoneyAccount[];
  dict: Dictionary;
  canDelete: boolean;
}

/**
 * Секция «Запланированные» — отложенные (planned) транзакции.
 * Действия: «Провести» (planned → posted, попадает в баланс) и «Удалить».
 * Рендерится только если есть planned-записи (контролируется страницей).
 *
 * Валютный инвариант: provести можно только на счёт той же валюты. Document-
 * драфты привязаны к дефолтному счёту, который может отличаться по валюте —
 * тогда показываем выбор совместимого счёта (или подсказку создать его).
 */
export function PlannedTransactions({ planned, accounts, dict, canDelete }: PlannedTransactionsProps) {
  const t = dict.money.planned;

  return (
    <div className="flex flex-col gap-2">
      {planned.map((tx) => (
        <PlannedRow
          key={tx.id}
          tx={tx}
          accounts={accounts}
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
  accounts,
  t,
  dict,
  canDelete,
}: {
  tx: MoneyTransactionWithRelations;
  accounts: MoneyAccount[];
  t: Dictionary["money"]["planned"];
  dict: Dictionary;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [isPosting, startPost] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { blocked, message } = useAccessGate("write");

  // Same-currency accounts the draft can post onto. If its current account
  // already matches, no picker is needed.
  const compatibleAccounts = useMemo(
    () => accounts.filter((a) => a.currency === tx.currency),
    [accounts, tx.currency],
  );
  const currentAccount = accounts.find((a) => a.id === tx.account_id) ?? null;
  const needsAccount = currentAccount?.currency !== tx.currency;
  const noCompatibleAccount = needsAccount && compatibleAccounts.length === 0;

  const [selectedAccount, setSelectedAccount] = useState<string>(compatibleAccounts[0]?.id ?? "");
  const effectiveAccount = selectedAccount || compatibleAccounts[0]?.id || "";

  function handlePost() {
    if (blocked) return;
    setError(null);
    startPost(async () => {
      const result = await postPlannedTransactionAction(tx.id, needsAccount ? effectiveAccount : undefined);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const postDisabled = blocked || isPosting || noCompatibleAccount || (needsAccount && !effectiveAccount);

  return (
    <div
      className={cn(
        "soft-card-sm flex flex-col gap-2 p-4 transition-opacity",
        isPosting && "opacity-50 pointer-events-none",
      )}
    >
      <div className="flex items-center gap-3">
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
          −{formatMoney(Number(tx.amount))} {tx.currency}
        </p>

        <RestrictedActionTooltip message={blocked ? message : t.postButton}>
          <button
            type="button"
            onClick={handlePost}
            disabled={postDisabled}
            title={blocked ? message : t.postButton}
            className="soft-icon-button h-9 w-9 shrink-0 text-accent-green disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckIcon size={16} strokeWidth={2} />
          </button>
        </RestrictedActionTooltip>

        {canDelete && (
          <DeleteTransactionButton
            transactionId={tx.id}
            transactionTitle={tx.title}
            dict={dict}
            className="h-9 w-9 shrink-0"
          />
        )}
      </div>

      {/* Currency picker: the draft needs a same-currency account to post onto. */}
      {needsAccount && !noCompatibleAccount && (
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span className="shrink-0">{t.selectAccount} · {tx.currency}</span>
          <select
            value={effectiveAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            disabled={isPosting}
            className="min-w-0 flex-1 rounded-(--neu-radius-sm) border border-border bg-surface px-2 py-1 text-text-primary"
          >
            {compatibleAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {noCompatibleAccount && <p className="text-xs text-accent-yellow">{t.noAccount}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
