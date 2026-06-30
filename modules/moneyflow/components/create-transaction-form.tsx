"use client";

import { useActionState, useRef } from "react";
import { createTransactionAction } from "../actions/create-transaction.action";
import { TRANSACTION_TYPES } from "../constants/moneyflow.constants";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import type { MoneyAccount, MoneyCategory } from "../types/moneyflow.types";
import type { Subscription } from "@/modules/subtracker/types/subtracker.types";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * Форма создания транзакции.
 *
 * Категория выбирается из существующих (системных) категорий организации —
 * их засевает Smart Categories (миграция 057). Ручное создание категории
 * убрано: ad-hoc кастомные категории не получают system_key и не участвуют в
 * авто-классификации, а форма остаётся короче.
 *
 * Поле статуса («Тип записи») тоже убрано: единственным значением из этой
 * формы всегда был `posted` (planned-черновики приходят только из пайплайна
 * документов), поэтому статус проставляет схема по умолчанию.
 */
interface CreateTransactionFormProps {
  dict: Dictionary;
  accounts: MoneyAccount[];
  categories: MoneyCategory[];
  subscriptions?: Subscription[];
  onSuccess?: () => void;
}

export function CreateTransactionForm({
  dict,
  accounts,
  categories,
  subscriptions = [],
  onSuccess,
}: CreateTransactionFormProps) {
  const t = dict.money.transactions;
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prevState, formData) => {
      const result = await createTransactionAction(prevState, formData);
      if (!result.error && !result.fieldErrors) {
        formRef.current?.reset();
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
    ...categories.map((cat) => ({
      value: cat.id,
      label: cat.name,
    })),
  ];

  // Опциональная привязка к подписке (формирует entity_link paid_by).
  const subscriptionOptions = [
    { value: "", label: `— ${t.subscriptionLabel} —` },
    ...subscriptions.map((sub) => ({ value: sub.id, label: sub.name })),
  ];

  const today = new Date().toISOString().split("T")[0];
  const hasAccounts = accounts.length > 0;

  return (
    <form ref={formRef} action={formAction}>
      {state.error && (
        <div className="mb-3 rounded-(--neu-radius-md) bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      {!hasAccounts && (
        <div className="mb-3 rounded-(--neu-radius-md) bg-info-soft border border-info/20 px-4 py-3 text-sm text-info">
          {dict.money.accounts.add}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Input
          id="tx-title"
          name="title"
          label={t.titleLabel}
          placeholder={t.titlePlaceholder}
          required
          className="h-11 py-0"
          error={state.fieldErrors?.title?.[0]}
        />

        <Input
          id="tx-amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          label={t.amountLabel}
          placeholder={t.amountPlaceholder}
          required
          className="h-11 py-0"
          error={state.fieldErrors?.amount?.[0]}
        />

        <Select
          id="tx-type"
          name="type"
          label={t.typeLabel}
          options={typeOptions}
          defaultValue="expense"
          className="h-11 py-0"
          error={state.fieldErrors?.type?.[0]}
        />

        <Select
          id="tx-account"
          name="account_id"
          label={t.accountLabel}
          options={
            hasAccounts
              ? accountOptions
              : [{ value: "", label: `— ${t.selectAccount} —` }]
          }
          required
          disabled={!hasAccounts}
          className="h-11 py-0"
          error={state.fieldErrors?.account_id?.[0]}
        />

        <Select
          id="tx-category"
          name="category_id"
          label={t.categoryLabel}
          options={categoryOptions}
          defaultValue=""
          className="h-11 py-0"
          error={state.fieldErrors?.category_id?.[0]}
        />

        {subscriptions.length > 0 && (
          <Select
            id="tx-subscription"
            name="subscription_id"
            label={t.subscriptionLabel}
            options={subscriptionOptions}
            defaultValue=""
            className="h-11 py-0"
            error={state.fieldErrors?.subscription_id?.[0]}
          />
        )}

        <Input
          id="tx-date"
          name="transaction_date"
          type="date"
          label={t.dateLabel}
          defaultValue={today}
          className="h-11 py-0"
          error={state.fieldErrors?.transaction_date?.[0]}
        />

        <Input
          id="tx-note"
          name="note"
          label={t.noteLabel}
          placeholder={t.notePlaceholder}
          className="h-11 py-0"
          error={state.fieldErrors?.note?.[0]}
        />

        <Button
          type="submit"
          isLoading={isPending}
          disabled={!hasAccounts}
          className="h-11 w-full py-0"
        >
          {isPending ? dict.common.loading : t.add}
        </Button>
      </div>
    </form>
  );
}
