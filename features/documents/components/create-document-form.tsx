"use client";

import { useActionState, useRef } from "react";
import { createDocumentAction } from "@/modules/documents/actions/create-document.action";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { DOCUMENT_TYPE_LABELS } from "@/modules/documents/constants/document.constants";
import type { ActionResult } from "@/lib/validators/common";

interface CreateDocumentFormProps {
  onSuccess?: () => void;
}

const DOC_TYPE_OPTIONS = (Object.entries(DOCUMENT_TYPE_LABELS) as [string, string][]).map(
  ([value, label]) => ({ value, label }),
);

export function CreateDocumentForm({ onSuccess }: CreateDocumentFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prevState, formData) => {
      const result = await createDocumentAction(prevState, formData);
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
        id="title"
        name="title"
        label="Title *"
        placeholder="Q3 Sales Report"
        required
        error={state.fieldErrors?.title?.[0]}
      />

      <Select
        id="doc_type"
        name="doc_type"
        label="Type"
        options={DOC_TYPE_OPTIONS}
        defaultValue="note"
        error={state.fieldErrors?.doc_type?.[0]}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="content" className="text-sm font-medium text-text-secondary">
          Content
        </label>
        <textarea
          id="content"
          name="content"
          rows={5}
          placeholder="Start writing…"
          className="soft-control w-full px-4 py-2.5 text-sm resize-y"
        />
        {state.fieldErrors?.content?.[0] && (
          <p className="text-xs font-medium text-danger" role="alert">
            {state.fieldErrors.content[0]}
          </p>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" isLoading={isPending}>
          {isPending ? "Creating…" : "Create Document"}
        </Button>
      </div>
    </form>
  );
}
