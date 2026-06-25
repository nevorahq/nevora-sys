"use client";

import { useActionState, useRef } from "react";
import { createDealAction } from "@/modules/crm/actions/create-deal.action";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import type { CrmPipelineWithStages, CrmClient } from "@/modules/crm/types/crm.types";
import type { ActionResult } from "@/lib/validators/common";

interface CreateDealFormProps {
  pipeline: CrmPipelineWithStages;
  clients: CrmClient[];
  onSuccess?: () => void;
}

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "RUB", label: "RUB" },
];

export function CreateDealForm({ pipeline, clients, onSuccess }: CreateDealFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prevState, formData) => {
      const result = await createDealAction(prevState, formData);
      if (!result.error && !result.fieldErrors) {
        formRef.current?.reset();
        onSuccess?.();
      }
      return result;
    },
    {},
  );

  const openStages = pipeline.stages.filter((s) => s.stage_type === "open");

  const stageOptions = openStages.map((s) => ({ value: s.id, label: s.name }));

  const clientOptions = [
    { value: "", label: "No client" },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <div className="rounded-lg bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      <input type="hidden" name="pipeline_id" value={pipeline.id} />

      <Input
        id="title"
        name="title"
        label="Deal title *"
        placeholder="Website redesign"
        required
        error={state.fieldErrors?.title?.[0]}
      />

      <Select
        id="stage_id"
        name="stage_id"
        label="Stage *"
        options={stageOptions}
        error={state.fieldErrors?.stage_id?.[0]}
      />

      <Select
        id="client_id"
        name="client_id"
        label="Client"
        options={clientOptions}
        defaultValue=""
        error={state.fieldErrors?.client_id?.[0]}
      />

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Input
            id="value"
            name="value"
            type="number"
            min="0"
            step="0.01"
            label="Value"
            placeholder="0"
            error={state.fieldErrors?.value?.[0]}
          />
        </div>
        <Select
          id="currency"
          name="currency"
          label="Currency"
          options={CURRENCY_OPTIONS}
          defaultValue="USD"
          error={state.fieldErrors?.currency?.[0]}
        />
      </div>

      <Input
        id="expected_close_date"
        name="expected_close_date"
        type="date"
        label="Expected close date"
        error={state.fieldErrors?.expected_close_date?.[0]}
      />

      <div className="flex justify-end pt-2">
        <Button type="submit" isLoading={isPending}>
          {isPending ? "Creating…" : "Create Deal"}
        </Button>
      </div>
    </form>
  );
}
