"use client";

import { useActionState, useRef } from "react";
import { createSubscriptionAction } from "../actions/create-subscription.action";
import { BILLING_CYCLES, SUB_CATEGORIES } from "../constants/subtracker.constants";
import {
  CURRENCY_NAMES,
  DEFAULT_BASE_CURRENCY,
  SUPPORTED_CURRENCIES,
  isSupportedCurrency,
} from "@/shared/config/currencies";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { DocumentFileUpload } from "@/modules/documents/components/document-file-upload";
import { useDocumentFiles } from "@/modules/documents/hooks/use-document-files";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * onSuccess — callback, вызывается после успешного создания.
 * Используется для закрытия модалки снаружи.
 */
interface CreateSubscriptionFormProps {
  dict: Dictionary;
  defaultCurrency?: string;
  onSuccess?: () => void;
}

export function CreateSubscriptionForm({
  dict,
  defaultCurrency = DEFAULT_BASE_CURRENCY,
  onSuccess,
}: CreateSubscriptionFormProps) {
  const t = dict.subscriptions.form;
  const formRef = useRef<HTMLFormElement>(null);
  const createdSubscriptionIdRef = useRef<string | null>(null);
  const { files, error: attachmentError, addFiles, removeFile, clearFiles } = useDocumentFiles();

  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    async (prevState, formData) => {
      let result: ActionResult;
      if (createdSubscriptionIdRef.current) {
        result = { subscriptionId: createdSubscriptionIdRef.current };
      } else {
        result = await createSubscriptionAction(prevState, formData);
        if (result.error || result.fieldErrors || !result.subscriptionId) return result;
        createdSubscriptionIdRef.current = result.subscriptionId;
      }

      if (files.length > 0) {
        try {
          const uploadData = new FormData();
          files.forEach((file) => uploadData.append("files", file));
          const response = await fetch(`/api/subscriptions/${result.subscriptionId}/document`, {
            method: "POST",
            body: uploadData,
          });
          const payload = await response.json() as { error?: string; warning?: string; documentId?: string };
          if (!response.ok) {
            return { ...result, error: payload.error ?? t.documents.uploadFailed };
          }
          result = { ...result, documentId: payload.documentId, warning: payload.warning };
        } catch {
          return { ...result, error: t.documents.networkError };
        }
      }

      formRef.current?.reset();
      clearFiles();
      createdSubscriptionIdRef.current = null;
      if (!result.warning) onSuccess?.();
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

  const currencyOptions = SUPPORTED_CURRENCIES.map((currency) => ({
    value: currency,
    label: `${currency} — ${CURRENCY_NAMES[currency]}`,
  }));
  const initialCurrency = isSupportedCurrency(defaultCurrency)
    ? defaultCurrency
    : DEFAULT_BASE_CURRENCY;

  const today = new Date().toISOString().split("T")[0];

  return (
    <form ref={formRef} action={formAction}>
      {state.error && (
        <div className="mb-3 rounded-(--neu-radius-md) bg-danger-soft border border-danger/20 px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      {state.warning && (
        <div className="mb-3 rounded-(--neu-radius-md) border border-info/20 bg-info-soft px-4 py-3 text-sm text-info" role="status">
          {state.warning}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          id="sub-name"
          name="name"
          label={t.nameLabel}
          placeholder={t.namePlaceholder}
          required
          error={state.fieldErrors?.name?.[0]}
        />

        <Input
          id="sub-amount"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          label={t.amountLabel}
          placeholder={t.amountPlaceholder}
          required
          error={state.fieldErrors?.amount?.[0]}
        />

        <Select
          id="sub-currency"
          name="currency"
          label={t.currencyLabel}
          options={currencyOptions}
          defaultValue={initialCurrency}
          error={state.fieldErrors?.currency?.[0]}
        />

        <Select
          id="sub-cycle"
          name="billing_cycle"
          label={t.cycleLabel}
          options={cycleOptions}
          defaultValue="monthly"
          error={state.fieldErrors?.billing_cycle?.[0]}
        />

        <Select
          id="sub-category"
          name="category"
          label={t.categoryLabel}
          options={categoryOptions}
          defaultValue="other"
          error={state.fieldErrors?.category?.[0]}
        />

        <Input
          id="sub-next-date"
          name="next_billing_date"
          type="date"
          label={t.nextDateLabel}
          defaultValue={today}
          required
          error={state.fieldErrors?.next_billing_date?.[0]}
        />

        <Input
          id="sub-url"
          name="url"
          type="url"
          label={t.urlLabel}
          placeholder={t.urlPlaceholder}
          error={state.fieldErrors?.url?.[0]}
        />

        <div className="sm:col-span-2">
          <Input
            id="sub-note"
            name="note"
            label={t.noteLabel}
            placeholder={t.notePlaceholder}
            error={state.fieldErrors?.note?.[0]}
          />
        </div>
      </div>

      <div className="mt-4">
        <DocumentFileUpload
          files={files}
          error={attachmentError}
          onAddFiles={addFiles}
          onRemoveFile={removeFile}
          title={t.documents.title}
          description={t.documents.description}
          cameraLabel={t.documents.takePhoto}
          filesLabel={t.documents.addFiles}
          removeLabel={t.documents.remove}
          attachedFilesLabel={t.documents.attachedFiles}
        />
      </div>

      <div className="mt-4">
        <Button type="submit" isLoading={isPending} disabled={Boolean(state.warning)} className="w-full">
          {isPending ? dict.common.loading : t.addButton}
        </Button>
      </div>
    </form>
  );
}
