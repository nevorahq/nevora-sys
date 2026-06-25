"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { createTransactionAction } from "../actions/create-transaction.action";
import { createCategoryInline } from "../actions/create-category.action";
import { TRANSACTION_TYPES, TRANSACTION_STATUSES, CATEGORY_TYPES } from "../constants/moneyflow.constants";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/cn";
import type { MoneyAccount, MoneyCategory } from "../types/moneyflow.types";
import type { Subscription } from "@/modules/subtracker/types/subtracker.types";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * Форма создания транзакции с inline-создание категории.
 *
 * Flow:
 * 1. Пользователь заполняет транзакцию
 * 2. В dropdown категорий нет нужной → нажимает "+"
 * 3. Появляется inline-форма: название + тип категории
 * 4. Нажимает "Add" → createCategoryInline() → категория создана
 * 5. Новая категория автоматически выбрана в dropdown
 * 6. Inline-форма закрывается
 * 7. Пользователь продолжает заполнять транзакцию
 *
 * Почему inline, а не модалка:
 * - Не теряется контекст (пользователь видит форму транзакции)
 * - Меньше кода (не нужен portal, overlay, focus trap)
 * - Быстрее для пользователя (один клик вместо трёх)
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
  categories: initialCategories,
  subscriptions = [],
  onSuccess,
}: CreateTransactionFormProps) {
  const t = dict.money.transactions;
  const catDict = dict.money.categories;
  const formRef = useRef<HTMLFormElement>(null);

  // Локальный список категорий — обновляется при inline-создании
  // без ожидания revalidation (optimistic UX)
  const [categories, setCategories] = useState(initialCategories);

  // Inline category form state
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<"income" | "expense">("expense");
  const [newCatError, setNewCatError] = useState("");
  const [isCreatingCat, startCatTransition] = useTransition();

  // Transaction form state
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

  // Inline category creation
  function handleCreateCategory() {
    if (!newCatName.trim()) return;
    setNewCatError("");

    startCatTransition(async () => {
      const result = await createCategoryInline(newCatName.trim(), newCatType);

      if (result.error) {
        setNewCatError(result.error);
        return;
      }

      if (result.id) {
        // Добавляем в локальный список (optimistic update)
        const newCategory: MoneyCategory = {
          id: result.id,
          user_id: "",
          name: newCatName.trim(),
          type: newCatType,
          color: null,
          icon: null,
          is_default: false,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setCategories((prev) => [...prev, newCategory]);

        // Сброс и закрытие inline-формы
        setNewCatName("");
        setShowNewCategory(false);
      }
    });
  }

  const typeOptions = TRANSACTION_TYPES.map((type) => ({
    value: type,
    label: t.types[type],
  }));

  const statusOptions = TRANSACTION_STATUSES.filter((status) => status !== "planned").map(
    (status) => ({
      value: status,
      label: t.statuses[status],
    }),
  );

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

  const catTypeOptions = CATEGORY_TYPES.map((type) => ({
    value: type,
    label: catDict.types[type],
  }));

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
          id="tx-status"
          name="status"
          label={t.statusLabel}
          options={statusOptions}
          defaultValue="posted"
          className="h-11 py-0"
          error={state.fieldErrors?.status?.[0]}
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

        {/* Category dropdown + "+" button */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text-secondary">
            {t.categoryLabel}
          </label>
          <div className="flex gap-2">
            <select
              id="tx-category"
              name="category_id"
              className="soft-control h-11 w-full px-4 py-0 text-sm appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1rem] bg-[position:right_0.75rem_center] bg-no-repeat pr-10"
            >
              {categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNewCategory((v) => !v)}
              className={cn(
                "soft-icon-button h-11 w-11 shrink-0",
                showNewCategory && "shadow-neu-inset text-text-primary",
              )}
              title={catDict.newCategory}
            >
              {showNewCategory ? (
                <XIcon size={16} strokeWidth={2} />
              ) : (
                <PlusIcon size={16} strokeWidth={2} />
              )}
            </button>
          </div>
          {state.fieldErrors?.category_id?.[0] && (
            <p className="text-xs font-medium text-danger" role="alert">
              {state.fieldErrors.category_id[0]}
            </p>
          )}
        </div>

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

      {/* ── Inline Category Creation ── */}
      {showNewCategory && (
        <div className="mt-3 soft-inset rounded-(--neu-radius-md) p-3">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
            {catDict.newCategory}
          </p>

          {newCatError && (
            <div className="mb-2 rounded-(--neu-radius-sm) bg-danger-soft border border-danger/20 px-3 py-2 text-xs text-danger">
              {newCatError}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="w-full">
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder={catDict.namePlaceholder}
                className="soft-control h-11 w-full px-3 py-0 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateCategory();
                  }
                }}
              />
            </div>

            <div className="w-full">
              <select
                value={newCatType}
                onChange={(e) => setNewCatType(e.target.value as "income" | "expense")}
                className="soft-control h-11 w-full px-3 py-0 text-sm appearance-none"
              >
                {catTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleCreateCategory}
              disabled={isCreatingCat || !newCatName.trim()}
              className={cn(
                "inline-flex items-center justify-center gap-1.5",
                "h-11 w-full rounded-(--neu-radius-pill) px-4 py-0",
                "text-xs font-semibold",
                "bg-text-primary text-text-inverse",
                "shadow-neu-control hover:shadow-neu-card",
                "active:shadow-neu-inset active:scale-[0.98]",
                "disabled:pointer-events-none disabled:opacity-50",
                "transition-all duration-150",
              )}
            >
              {isCreatingCat ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {catDict.creating}
                </>
              ) : (
                <>
                  <PlusIcon size={14} />
                  {catDict.add}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
