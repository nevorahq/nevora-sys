"use client";

import { useState, useTransition } from "react";
import { ArrowUpRightIcon, ArrowDownLeftIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { deleteTransactionAction } from "../actions/delete-transaction.action";
import { formatMoney } from "@/shared/utils/format-money";
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
}

export function TransactionItem({
  transaction: tx,
  accounts,
  categories,
  dict,
}: TransactionItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  const isIncome = tx.type === "income";

  function handleDelete() {
    startDelete(async () => {
      await deleteTransactionAction(tx.id);
    });
  }

  return (
    <>
      <div
        className={cn(
          "soft-card-sm flex items-center gap-3 p-4 transition-opacity",
          isDeleting && "opacity-50 pointer-events-none",
        )}
      >
        {/* Type icon */}
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

        {/* Title + category */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{tx.title}</p>
          <p className="text-xs text-text-muted truncate">
            {tx.category?.name ?? "—"}
            {tx.account?.name ? ` · ${tx.account.name}` : ""}
          </p>
        </div>

        {/* Amount + date */}
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

        {/* Edit button */}
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="soft-icon-button h-8 w-8 text-text-muted hover:text-text-primary"
          aria-label={dict.money.transactions.editButton}
        >
          <PencilIcon size={15} strokeWidth={1.75} />
        </button>

        {/* Delete button */}
        <button
          type="button"
          onClick={handleDelete}
          className="soft-icon-button h-8 w-8 text-text-muted hover:text-danger"
          aria-label={dict.money.transactions.deleteButton}
        >
          <Trash2Icon size={15} strokeWidth={1.75} />
        </button>
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
