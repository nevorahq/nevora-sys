"use client";

import { useActionState, useMemo, useRef } from "react";
import { createTransferAction } from "../actions/create-transfer.action";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { formatMoney } from "@/shared/utils/format-money";
import type { MoneyAccount } from "../types/moneyflow.types";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * Форма перевода средств между счетами (Internal Transfer).
 *
 * From account фиксирован (счёт, с карточки которого открыли модалку) — показан
 * как read-only поле + hidden input. To account — только активные счета той же
 * валюты (MVP: без конвертации), сам источник исключён, поэтому выбрать один и
 * тот же счёт нельзя. Серверный action валидирует те же правила повторно.
 */
interface TransferFormProps {
  fromAccount: MoneyAccount;
  accounts: MoneyAccount[];
  dict: Dictionary;
  onSuccess?: () => void;
}

export function TransferForm({ fromAccount, accounts, dict, onSuccess }: TransferFormProps) {
  const t = dict.money.transfer;
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prevState, formData) => {
      const result = await createTransferAction(prevState, formData);
      if (!result.error && !result.fieldErrors) {
        formRef.current?.reset();
        onSuccess?.();
      }
      return result;
    },
    {},
  );

  // To account: same currency, active, not the source itself.
  const toOptions = useMemo(
    () =>
      accounts
        .filter(
          (a) => a.id !== fromAccount.id && a.is_active && a.currency === fromAccount.currency,
        )
        .map((a) => ({ value: a.id, label: a.name })),
    [accounts, fromAccount],
  );

  const today = new Date().toISOString().split("T")[0];
  const hasDestination = toOptions.length > 0;

  return (
    <form ref={formRef} action={formAction}>
      {state.error && (
        <div className="mb-3 rounded-(--neu-radius-md) bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      {!hasDestination && (
        <div className="mb-3 rounded-(--neu-radius-md) bg-info-soft border border-info/20 px-4 py-3 text-sm text-info">
          {t.noDestination}
        </div>
      )}

      <input type="hidden" name="from_account_id" value={fromAccount.id} />

      <div className="flex flex-col gap-3">
        {/* From — read-only */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">{t.fromLabel}</span>
          <div className="soft-control flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="font-medium text-text-primary">{fromAccount.name}</span>
            <span className="text-text-muted tabular-nums">
              {formatMoney(Number(fromAccount.initial_balance))} {fromAccount.currency}
            </span>
          </div>
        </div>

        <Select
          id="transfer-to"
          name="to_account_id"
          label={t.toLabel}
          options={
            hasDestination ? toOptions : [{ value: "", label: t.selectDestination }]
          }
          required
          disabled={!hasDestination}
          className="h-11 py-0"
          error={state.fieldErrors?.to_account_id?.[0]}
        />

        <Input
          id="transfer-amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          label={`${t.amountLabel} (${fromAccount.currency})`}
          placeholder={t.amountPlaceholder}
          required
          disabled={!hasDestination}
          className="h-11 py-0"
          error={state.fieldErrors?.amount?.[0]}
        />

        <Input
          id="transfer-date"
          name="transaction_date"
          type="date"
          label={t.dateLabel}
          defaultValue={today}
          disabled={!hasDestination}
          className="h-11 py-0"
          error={state.fieldErrors?.transaction_date?.[0]}
        />

        <Input
          id="transfer-note"
          name="note"
          label={t.noteLabel}
          placeholder={t.notePlaceholder}
          disabled={!hasDestination}
          className="h-11 py-0"
          error={state.fieldErrors?.note?.[0]}
        />

        <Button
          type="submit"
          isLoading={isPending}
          disabled={!hasDestination}
          className="h-11 w-full py-0"
        >
          {isPending ? dict.common.loading : t.submit}
        </Button>
      </div>
    </form>
  );
}
