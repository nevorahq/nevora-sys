"use client";

import { useActionState, useRef } from "react";
import { createAccountAction } from "../actions/create-account.action";
import { ACCOUNT_TYPES } from "../constants/moneyflow.constants";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface CreateAccountFormProps {
  dict: Dictionary;
  onSuccess?: () => void;
}

export function CreateAccountForm({ dict, onSuccess }: CreateAccountFormProps) {
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

  return (
    <form ref={formRef} action={formAction}>
      {state.error && (
        <div className="mb-3 rounded-(--neu-radius-md) bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            id="account-name"
            name="name"
            label={t.nameLabel}
            placeholder={t.namePlaceholder}
            required
            error={state.fieldErrors?.name?.[0]}
          />
        </div>

        <div className="w-full sm:w-36">
          <Select
            id="account-type"
            name="type"
            label={t.typeLabel}
            options={typeOptions}
            defaultValue="card"
            error={state.fieldErrors?.type?.[0]}
          />
        </div>

        <div className="w-full sm:w-36">
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

        <Button type="submit" isLoading={isPending} className="w-full sm:w-auto">
          {isPending ? dict.common.loading : t.add}
        </Button>
      </div>
    </form>
  );
}
