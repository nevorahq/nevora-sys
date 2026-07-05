"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/shared/ui/button";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { createPlannerEntryAction } from "../actions/create-planner-entry.action";

interface CaptureInputProps {
  dict: Dictionary["inbox"];
}

/**
 * The single capture box. Text-first MVP: submit a raw thought, the server
 * captures it and runs intent detection, and the review surfaces update on
 * revalidation. Never touches money.
 */
export function CaptureInput({ dict }: CaptureInputProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prevState, formData) => {
      const result = await createPlannerEntryAction(prevState, formData);
      if (!result.error && !result.fieldErrors) {
        formRef.current?.reset();
      }
      return result;
    },
    {},
  );

  return (
    <form ref={formRef} action={formAction} className="soft-card p-4">
      <input type="hidden" name="entryType" value="text" />
      <label htmlFor="capture-raw-text" className="sr-only">
        {dict.capturePlaceholder}
      </label>
      <textarea
        id="capture-raw-text"
        name="rawText"
        rows={3}
        required
        placeholder={dict.capturePlaceholder}
        className="w-full resize-none rounded-(--neu-radius-md) bg-surface-sunken px-4 py-3 text-sm text-text-primary shadow-neu-inset placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-yellow/40"
      />
      {state.fieldErrors?.rawText?.[0] && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {state.fieldErrors.rawText[0]}
        </p>
      )}
      {state.error && (
        <p className="mt-2 text-xs text-danger" role="alert">
          {state.error}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <Button type="submit" isLoading={isPending}>
          {isPending ? dict.capturing : dict.captureButton}
        </Button>
      </div>
    </form>
  );
}
