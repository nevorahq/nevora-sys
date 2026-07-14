"use client";

import { useActionState, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import type { ActionResult } from "@/lib/validators/common";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { acceptPlannerSuggestionAction } from "../actions/accept-planner-suggestion.action";
import { rejectPlannerSuggestionAction } from "../actions/reject-planner-suggestion.action";
import { editPlannerSuggestionAction } from "../actions/edit-planner-suggestion.action";
import { isFinancialSuggestionType, type PlannerSuggestion } from "../types/planner.types";

interface SuggestionReviewActionsProps {
  suggestion: PlannerSuggestion;
  dict: Dictionary["inbox"];
}

/** The financial keys the accept-time schema reads out of proposed_payload. */
interface FinancialPayload {
  financialDueDate?: string;
  amount?: number;
  currency?: string;
  providerName?: string;
}

function readFinancialPayload(payload: Record<string, unknown>): FinancialPayload {
  return {
    financialDueDate: typeof payload.financialDueDate === "string" ? payload.financialDueDate : undefined,
    amount: typeof payload.amount === "number" ? payload.amount : undefined,
    currency: typeof payload.currency === "string" ? payload.currency : undefined,
    providerName: typeof payload.providerName === "string" ? payload.providerName : undefined,
  };
}

/**
 * Today in the viewer's local timezone as YYYY-MM-DD. The obligation is a date,
 * not a datetime, so no time component — it seeds the payment-date field as a sane
 * editable default when the capture didn't imply one.
 */
function todayLocalISO(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * Accept / Edit / Reject controls for a pending suggestion. Each is a Server
 * Action; Accept routes to the existing module service, so no client-side
 * business logic lives here.
 *
 * Financial suggestions (payment/reminder types) require a payment date before
 * they can be accepted — the AI leaves it out when the raw capture doesn't imply
 * one. The edit form therefore exposes the financial fields so the user can supply
 * the date (and amount/currency/provider) the accept schema needs; without them
 * the only escape from a dateless financial draft would be Reject.
 */
export function SuggestionReviewActions({ suggestion, dict }: SuggestionReviewActionsProps) {
  const [editing, setEditing] = useState(false);
  const isFinancial = isFinancialSuggestionType(suggestion.suggestion_type);
  const financial = readFinancialPayload(suggestion.proposed_payload ?? {});
  const needsDate = isFinancial && !financial.financialDueDate;

  const [acceptState, acceptAction, acceptPending] = useActionState<ActionResult, FormData>(
    acceptPlannerSuggestionAction,
    {},
  );
  const [rejectState, rejectAction, rejectPending] = useActionState<ActionResult, FormData>(
    rejectPlannerSuggestionAction,
    {},
  );
  const [editState, editAction, editPending] = useActionState<ActionResult, FormData>(
    async (prev, formData) => {
      // Marshal the financial fields into the single proposed_payload JSON the edit
      // action expects. The payload is REPLACED on the server, so send the full set
      // (pre-filled from the current payload) rather than a partial patch.
      if (isFinancial) {
        const payload: FinancialPayload = {};
        const date = (formData.get("financialDueDate") as string | null)?.trim();
        if (date) payload.financialDueDate = date;
        const amountRaw = (formData.get("amount") as string | null)?.trim();
        if (amountRaw) {
          const amount = Number(amountRaw);
          if (Number.isFinite(amount) && amount > 0) payload.amount = amount;
        }
        const currency = (formData.get("currency") as string | null)?.trim();
        if (currency) payload.currency = currency.toUpperCase();
        const provider = (formData.get("providerName") as string | null)?.trim();
        if (provider) payload.providerName = provider;
        formData.set("proposedPayload", JSON.stringify(payload));
      }
      const result = await editPlannerSuggestionAction(prev, formData);
      if (!result.error && !result.fieldErrors) setEditing(false);
      return result;
    },
    {},
  );

  const error = acceptState.error || rejectState.error || editState.error;

  return (
    <div className="mt-3 border-t border-border-soft pt-3">
      {error && (
        <p className="mb-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      {needsDate && !editing && (
        <p className="mb-2 rounded-(--neu-radius-sm) bg-accent-yellow/20 px-2 py-1 text-[11px] font-medium text-text-primary">
          {dict.financialFields.needsDateHint}
        </p>
      )}

      {editing ? (
        <form action={editAction} className="flex flex-col gap-2">
          <input type="hidden" name="suggestionId" value={suggestion.id} />
          <Input name="title" label={dict.edit} defaultValue={suggestion.title} required />
          <textarea
            name="description"
            rows={2}
            defaultValue={suggestion.description ?? ""}
            className="w-full resize-none rounded-(--neu-radius-md) bg-surface-sunken px-3 py-2 text-sm text-text-primary shadow-neu-inset focus:outline-none focus:ring-2 focus:ring-accent-yellow/40"
          />

          {isFinancial && (
            <div className="flex flex-col gap-2">
              <Input
                id="financial-due-date"
                type="date"
                name="financialDueDate"
                label={dict.financialFields.paymentDate}
                defaultValue={financial.financialDueDate ?? todayLocalISO()}
                required
              />
              <Input
                id="financial-amount"
                type="number"
                name="amount"
                inputMode="decimal"
                min="0"
                step="0.01"
                label={dict.financialFields.amount}
                defaultValue={financial.amount != null ? String(financial.amount) : ""}
              />
              <Input
                id="financial-currency"
                name="currency"
                maxLength={3}
                label={dict.financialFields.currency}
                defaultValue={financial.currency ?? ""}
                className="uppercase"
              />
              <Input
                id="financial-provider"
                name="providerName"
                label={dict.financialFields.provider}
                defaultValue={financial.providerName ?? ""}
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" isLoading={editPending} variant="primary">
              {dict.save}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              {dict.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {needsDate ? (
            // Accept would fail the date requirement — send the user to the editor,
            // where the payment date is already pre-filled with today, instead of
            // firing a server call that only returns an error.
            <Button type="button" variant="primary" onClick={() => setEditing(true)}>
              {dict.accept}
            </Button>
          ) : (
            <form action={acceptAction}>
              <input type="hidden" name="suggestionId" value={suggestion.id} />
              <Button type="submit" isLoading={acceptPending} variant="primary">
                {dict.accept}
              </Button>
            </form>
          )}
          <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
            {dict.edit}
          </Button>
          <form action={rejectAction}>
            <input type="hidden" name="suggestionId" value={suggestion.id} />
            <Button type="submit" isLoading={rejectPending} variant="ghost">
              {dict.reject}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
