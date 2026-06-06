"use client";

import { useActionState } from "react";
import { updateTransactionAction } from "../actions/update-transaction.action";
import { TRANSACTION_TYPES } from "../constants/moneyflow.constants";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import type { MoneyAccount, MoneyCategory, MoneyTransaction } from "../types/moneyflow.types";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface TransactionEditFormProps {
  transaction: MoneyTransaction;
  accounts: MoneyAccount[];
  categories: MoneyCategory[];
  dict: Dictionary;
  onSuccess?: () => void;
}

export function TransactionEditForm({
  transaction: tx,
  accounts,
  categories,
  dict,
  onSuccess,
}: TransactionEditFormProps) {
  const t = dict.money.transactions;

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prevState, formData) => {
      const result = await updateTransactionAction(prevState, formData);
      if (!result.error && !result.fieldErrors) {
        onSuccess?.();
      }
      return result;
    },
    {},
  );

  const typeOptions = TRANSACTION_TYPES.map((type) => ({
    value: type,
    label: t.types[type],
  }));

  const accountOptions = accounts.map((acc) => ({
    value: acc.id,
    label: acc.name,
  }));

  const categoryOptions = [
    { value: "", label: `— ${t.selectCategory} —` },
    ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
  ];

  return (
    <form action={formAction}>
      <input type="hidden" name="transactionId" value={tx.id} />

      {state.error && (
        <div className="mb-3 rounded-(--neu-radius-md) bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          id="edit-tx-title"
          name="title"
          label={t.titleLabel}
          placeholder={t.titlePlaceholder}
          defaultValue={tx.title}
          required
          error={state.fieldErrors?.title?.[0]}
        />

        <Input
          id="edit-tx-amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          label={t.amountLabel}
          placeholder={t.amountPlaceholder}
          defaultValue={String(tx.amount)}
          required
          error={state.fieldErrors?.amount?.[0]}
        />

        <Select
          id="edit-tx-type"
          name="type"
          label={t.typeLabel}
          options={typeOptions}
          defaultValue={tx.type}
          error={state.fieldErrors?.type?.[0]}
        />

        <Select
          id="edit-tx-account"
          name="account_id"
          label={t.accountLabel}
          options={accountOptions}
          defaultValue={tx.account_id}
          error={state.fieldErrors?.account_id?.[0]}
        />

        <Select
          id="edit-tx-category"
          name="category_id"
          label={t.categoryLabel}
          options={categoryOptions}
          defaultValue={tx.category_id ?? ""}
          error={state.fieldErrors?.category_id?.[0]}
        />

        <Input
          id="edit-tx-date"
          name="transaction_date"
          type="date"
          label={t.dateLabel}
          defaultValue={tx.transaction_date}
          error={state.fieldErrors?.transaction_date?.[0]}
        />

        <div className="sm:col-span-2">
          <Input
            id="edit-tx-note"
            name="note"
            label={t.noteLabel}
            placeholder={t.notePlaceholder}
            defaultValue={tx.note ?? ""}
            error={state.fieldErrors?.note?.[0]}
          />
        </div>
      </div>

      <div className="mt-4">
        <Button type="submit" isLoading={isPending} className="w-full">
          {isPending ? dict.common.loading : t.updateButton}
        </Button>
      </div>
    </form>
  );
}
