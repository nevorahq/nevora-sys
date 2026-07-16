"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRightIcon, ArrowDownLeftIcon, ArrowRightLeftIcon, PencilIcon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import { formatMoney } from "@/shared/utils/format-money";
import { DeleteTransactionButton } from "./delete-transaction-button";
import { TransactionEditForm } from "./transaction-edit-form";
import { Modal } from "@/shared/ui/modal";
import { RestrictedActionTooltip, useAccessGate } from "@/modules/billing/components/access-state";
import { cn } from "@/shared/utils/cn";
import { formatDate, formatTime } from "@/shared/utils/format-date";
import type { MoneyAccount, MoneyCategory, MoneyTransactionWithRelations } from "../types/moneyflow.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface TransactionItemProps {
  transaction: MoneyTransactionWithRelations;
  accounts: MoneyAccount[];
  categories: MoneyCategory[];
  dict: Dictionary;
  canDelete: boolean;
}

export function TransactionItem({
  transaction: tx,
  accounts,
  categories,
  dict,
  canDelete,
}: TransactionItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { blocked, message } = useAccessGate("write");

  const isTransfer = tx.type === "transfer";
  const isIncome = tx.type === "income";
  const isCrossCurrency = isTransfer && tx.destination_currency !== tx.currency;

  // Transfer is neutral: no green/red, no +/−, shows "From → To".
  const subtitle = isTransfer
    ? `${tx.currency} ${tx.from_account?.name ?? "—"} → ${tx.destination_currency ?? tx.currency} ${tx.to_account?.name ?? "—"}${
        isCrossCurrency && tx.effective_exchange_rate
          ? ` · ${dict.money.transfer.effectiveRate}: 1 ${tx.currency} = ${Number(tx.effective_exchange_rate).toLocaleString("en-US", { maximumFractionDigits: 10, useGrouping: false })} ${tx.destination_currency}`
          : ""
      }`
    : `${tx.category?.name ?? "—"}${tx.account?.name ? ` · ${tx.account.name}` : ""}`;

  return (
    <>
      <div className="soft-card-sm flex items-center gap-2 p-2 transition-shadow hover:shadow-neu-card">
        <Link
          href={`${ROUTES.money}/${tx.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-(--neu-radius-md) p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">
              {isTransfer ? dict.money.transfer.label : tx.title}
            </p>
            <p className="truncate text-xs text-text-muted">{subtitle}</p>
          </div>

          <div className="shrink-0 text-right">
            <p
              className={cn(
                "text-sm font-semibold tabular-nums",
                isTransfer ? "text-text-secondary" : isIncome ? "text-accent-green" : "text-text-primary",
              )}
            >
              {isCrossCurrency
                ? `−${formatMoney(Number(tx.amount))} ${tx.currency} → +${formatMoney(Number(tx.destination_amount ?? tx.amount))} ${tx.destination_currency}`
                : `${isTransfer ? "" : isIncome ? "+" : "−"}${formatMoney(Number(tx.amount))}`}
            </p>
            <p className="text-xs text-text-muted" suppressHydrationWarning>
              {formatDate(tx.transaction_date)}, {formatTime(tx.created_at)}
            </p>
          </div>
        </Link>

        {!isTransfer && (
          <RestrictedActionTooltip message={blocked ? message : dict.money.transactions.editButton}>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              disabled={blocked}
              className="soft-icon-button h-8 w-8 text-text-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={blocked ? `${dict.money.transactions.editButton}. ${message}` : dict.money.transactions.editButton}
            >
              <PencilIcon size={15} strokeWidth={1.75} />
            </button>
          </RestrictedActionTooltip>
        )}

        {canDelete && (
          <DeleteTransactionButton
            transactionId={tx.id}
            transactionTitle={tx.title}
            dict={dict}
          />
        )}
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title={dict.money.transactions.editButton}
        closeLabel={dict.common.close}
      >
        <TransactionEditForm
          transaction={tx}
          accounts={accounts}
          categories={categories}
          dict={dict}
          onSuccess={() => setIsEditing(false)}
        />
      </Modal>
    </>
  );
}
