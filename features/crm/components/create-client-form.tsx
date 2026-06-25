"use client";

import { useActionState, useRef } from "react";
import { createClientAction } from "@/modules/crm/actions/create-client.action";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import type { ActionResult } from "@/lib/validators/common";

interface CreateClientFormProps {
  onSuccess?: () => void;
}

const CLIENT_TYPE_OPTIONS = [
  { value: "company",    label: "Company" },
  { value: "individual", label: "Individual" },
];

const STATUS_OPTIONS = [
  { value: "lead",     label: "Lead" },
  { value: "prospect", label: "Prospect" },
  { value: "customer", label: "Customer" },
  { value: "churned",  label: "Churned" },
];

const SOURCE_OPTIONS = [
  { value: "manual",   label: "Manual" },
  { value: "referral", label: "Referral" },
  { value: "form",     label: "Form" },
  { value: "import",   label: "Import" },
  { value: "api",      label: "API" },
];

export function CreateClientForm({ onSuccess }: CreateClientFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prevState, formData) => {
      const result = await createClientAction(prevState, formData);
      if (!result.error && !result.fieldErrors) {
        formRef.current?.reset();
        onSuccess?.();
      }
      return result;
    },
    {},
  );

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <div className="rounded-lg bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      <Input
        id="name"
        name="name"
        label="Name *"
        placeholder="Acme Corp"
        required
        error={state.fieldErrors?.name?.[0]}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          id="email"
          name="email"
          type="email"
          label="Email"
          placeholder="contact@acme.com"
          error={state.fieldErrors?.email?.[0]}
        />
        <Input
          id="phone"
          name="phone"
          label="Phone"
          placeholder="+1 555 000 0000"
          error={state.fieldErrors?.phone?.[0]}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Select
          id="client_type"
          name="client_type"
          label="Type"
          options={CLIENT_TYPE_OPTIONS}
          defaultValue="company"
          error={state.fieldErrors?.client_type?.[0]}
        />
        <Select
          id="status"
          name="status"
          label="Status"
          options={STATUS_OPTIONS}
          defaultValue="lead"
          error={state.fieldErrors?.status?.[0]}
        />
        <Select
          id="source"
          name="source"
          label="Source"
          options={SOURCE_OPTIONS}
          defaultValue="manual"
          error={state.fieldErrors?.source?.[0]}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" isLoading={isPending}>
          {isPending ? "Creating…" : "Create Client"}
        </Button>
      </div>
    </form>
  );
}
