"use client";

import { useActionState } from "react";
import { updateSubscriptionAction } from "../actions/update-subscription.action";
import { BILLING_CYCLES, SUB_CATEGORIES } from "../constants/subtracker.constants";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import type { Subscription } from "../types/subtracker.types";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface SubEditFormProps {
  subscription: Subscription;
  dict: Dictionary;
  onSuccess?: () => void;
}

export function SubEditForm({ subscription: sub, dict, onSuccess }: SubEditFormProps) {
  const t = dict.subscriptions.form;

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prevState, formData) => {
      const result = await updateSubscriptionAction(prevState, formData);
      if (!result.error && !result.fieldErrors) {
        onSuccess?.();
      }
      return result;
    },
    {},
  );

  const cycleOptions = BILLING_CYCLES.map((cycle) => ({
    value: cycle,
    label: dict.subscriptions.cycles[cycle],
  }));

  const categoryOptions = SUB_CATEGORIES.map((cat) => ({
    value: cat,
    label: dict.subscriptions.categories[cat],
  }));

  return (
    <form action={formAction}>
      <input type="hidden" name="subscriptionId" value={sub.id} />

      {state.error && (
        <div className="mb-3 rounded-(--neu-radius-md) bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          id="edit-sub-name"
          name="name"
          label={t.nameLabel}
          placeholder={t.namePlaceholder}
          defaultValue={sub.name}
          required
          error={state.fieldErrors?.name?.[0]}
        />

        <Input
          id="edit-sub-amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          label={t.amountLabel}
          placeholder={t.amountPlaceholder}
          defaultValue={String(sub.amount)}
          required
          error={state.fieldErrors?.amount?.[0]}
        />

        <Select
          id="edit-sub-cycle"
          name="billing_cycle"
          label={t.cycleLabel}
          options={cycleOptions}
          defaultValue={sub.billing_cycle}
          error={state.fieldErrors?.billing_cycle?.[0]}
        />

        <Select
          id="edit-sub-category"
          name="category"
          label={t.categoryLabel}
          options={categoryOptions}
          defaultValue={sub.category}
          error={state.fieldErrors?.category?.[0]}
        />

        <Input
          id="edit-sub-next-date"
          name="next_billing_date"
          type="date"
          label={t.nextDateLabel}
          defaultValue={sub.next_billing_date}
          required
          error={state.fieldErrors?.next_billing_date?.[0]}
        />

        <Input
          id="edit-sub-url"
          name="url"
          type="url"
          label={t.urlLabel}
          placeholder={t.urlPlaceholder}
          defaultValue={sub.url ?? ""}
          error={state.fieldErrors?.url?.[0]}
        />

        <div className="sm:col-span-2">
          <Input
            id="edit-sub-note"
            name="note"
            label={t.noteLabel}
            placeholder={t.notePlaceholder}
            defaultValue={sub.note ?? ""}
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
