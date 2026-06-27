"use client";

import { useActionState, useRef } from "react";
import { createAccountAction } from "../actions/create-account.action";
import {
  ACCOUNT_TYPES,
  DEFAULT_CURRENCY,
  MONEY_ACCOUNT_CURRENCIES,
} from "../constants/moneyflow.constants";
import {
  CURRENCY_NAMES,
} from "@/shared/config/currencies";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface CreateAccountFormProps {
  dict: Dictionary;
  defaultCurrency?: string;
  onSuccess?: () => void;
}

export function CreateAccountForm({ dict, defaultCurrency = DEFAULT_CURRENCY, onSuccess }: CreateAccountFormProps) {
  const t = dict.money.accounts;
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prevState, formData) => {
      const result = await createAccountAction(prevState, formData);
      if (!result.error && !result.fieldErrors) {
        formRef.current?.reset();
        onSuccess?.();
      }
      return result;
    },
    {},
  );

  const typeOptions = ACCOUNT_TYPES.map((type) => ({
    value: type,
    label: t.types[type],
  }));
  const currencyOptions = MONEY_ACCOUNT_CURRENCIES.map((currency) => ({
    value: currency,
    label: `${currency === "RUB" ? "RUR (RUB)" : currency} — ${CURRENCY_NAMES[currency]}`,
  }));
  const initialCurrency = MONEY_ACCOUNT_CURRENCIES.some((currency) => currency === defaultCurrency)
    ? defaultCurrency
    : DEFAULT_CURRENCY;

  return (
    <form ref={formRef} action={formAction}>
      {state.error && (
        <div className="mb-3 rounded-(--neu-radius-md) bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            id="account-name"
            name="name"
            label={t.nameLabel}
            placeholder={t.namePlaceholder}
            required
            error={state.fieldErrors?.name?.[0]}
          />
        </div>

        <div>
          <Select
            id="account-type"
            name="type"
            label={t.typeLabel}
            options={typeOptions}
            defaultValue="card"
            error={state.fieldErrors?.type?.[0]}
          />
        </div>

        <div>
          <Select
            id="account-currency"
            name="currency"
            label={t.currencyLabel}
            options={currencyOptions}
            defaultValue={initialCurrency}
            error={state.fieldErrors?.currency?.[0]}
          />
        </div>

        <div>
          <Input
            id="account-balance"
            name="initial_balance"
            type="number"
            step="0.01"
            label={t.balanceLabel}
            placeholder={t.balancePlaceholder}
            defaultValue="0"
            error={state.fieldErrors?.initial_balance?.[0]}
          />
        </div>

        <Button type="submit" isLoading={isPending} className="w-full self-end">
          {isPending ? dict.common.loading : t.add}
        </Button>
      </div>
    </form>
  );
}
