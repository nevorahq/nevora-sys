"use client";

import { useActionState } from "react";
import { updateAccountAction } from "../actions/update-account.action";
import { ACCOUNT_TYPES } from "../constants/moneyflow.constants";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import type { MoneyAccount } from "../types/moneyflow.types";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface AccountEditFormProps {
  account: MoneyAccount;
  dict: Dictionary;
  onSuccess?: () => void;
}

export function AccountEditForm({ account, dict, onSuccess }: AccountEditFormProps) {
  const t = dict.money.accounts;

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prevState, formData) => {
      const result = await updateAccountAction(prevState, formData);
      if (!result.error && !result.fieldErrors) {
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

  return (
    <form action={formAction}>
      <input type="hidden" name="accountId" value={account.id} />

      {state.error && (
        <div className="mb-3 rounded-(--neu-radius-md) bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Input
          id="edit-account-name"
          name="name"
          label={t.nameLabel}
          placeholder={t.namePlaceholder}
          defaultValue={account.name}
          required
          error={state.fieldErrors?.name?.[0]}
        />

        <Select
          id="edit-account-type"
          name="type"
          label={t.typeLabel}
          options={typeOptions}
          defaultValue={account.type}
          error={state.fieldErrors?.type?.[0]}
        />

        <Input
          id="edit-account-initial-balance"
          name="initial_balance"
          type="number"
          step="0.01"
          label={`${t.initialBalance} (${account.currency})`}
          defaultValue={String(account.initial_balance)}
          required
          error={state.fieldErrors?.initial_balance?.[0]}
        />
      </div>

      <div className="mt-4">
        <Button type="submit" isLoading={isPending} className="w-full">
          {isPending ? dict.common.loading : t.updateButton}
        </Button>
      </div>
    </form>
  );
}
