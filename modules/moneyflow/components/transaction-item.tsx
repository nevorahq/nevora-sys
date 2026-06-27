"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRightIcon, ArrowDownLeftIcon, PencilIcon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import { formatMoney } from "@/shared/utils/format-money";
import { DeleteTransactionButton } from "./delete-transaction-button";
import { TransactionEditForm } from "./transaction-edit-form";
import { Modal } from "@/shared/ui/modal";
import { cn } from "@/shared/utils/cn";
import { formatDate } from "@/shared/utils/format-date";
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

  const isIncome = tx.type === "income";

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
              isIncome ? "bg-accent-green-soft" : "bg-accent-pink-soft",
            )}
          >
            {isIncome ? (
              <ArrowDownLeftIcon size={18} className="text-accent-green" strokeWidth={2} />
            ) : (
              <ArrowUpRightIcon size={18} className="text-accent-pink" strokeWidth={2} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">{tx.title}</p>
            <p className="truncate text-xs text-text-muted">
              {tx.category?.name ?? "—"}
              {tx.account?.name ? ` · ${tx.account.name}` : ""}
            </p>
          </div>

          <div className="shrink-0 text-right">
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
        </Link>

        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="soft-icon-button h-8 w-8 text-text-muted hover:text-text-primary"
          aria-label={dict.money.transactions.editButton}
        >
          <PencilIcon size={15} strokeWidth={1.75} />
        </button>

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
