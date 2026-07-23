"use client";

import { useState, useTransition } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import {
  confirmSubscriptionTaskSuggestion,
  rejectFinancialSuggestion,
} from "@/modules/review/actions/financial-suggestion.actions";
import { FinancialStateBadge } from "@/modules/moneyflow/components/financial-state-badge";
import { Button } from "@/shared/ui/button";
import { formatDate } from "@/shared/utils/format-date";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

export interface SubscriptionSuggestionItem {
  id: string;
  suggestion_type: string;
  review_state: "detected" | "suggested" | "waiting_confirmation" | "confirmed" | "rejected";
  amount: number | null;
  currency: string | null;
  due_date: string | null;
}

export function SubscriptionSuggestionPanel({
  suggestions,
  canWrite,
  stateLabels,
}: {
  suggestions: SubscriptionSuggestionItem[];
  canWrite: boolean;
  /** Canonical financial-state labels (`dict.money.states`). */
  stateLabels: Dictionary["money"]["states"];
}) {
  const [visible, setVisible] = useState(suggestions);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(id: string, action: "confirm" | "reject") {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const res =
        action === "confirm"
          ? await confirmSubscriptionTaskSuggestion({ suggestionId: id })
          : await rejectFinancialSuggestion({ suggestionId: id, reason: "Rejected from subscription detail" });
      setPendingId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setVisible((current) => current.filter((item) => item.id !== id));
    });
  }

  if (visible.length === 0) return null;

  return (
    <section className="soft-card p-5 sm:p-6">
      <h2 className="text-base font-semibold text-text-primary">Financial suggestions</h2>
      <ul className="mt-3 space-y-2">
        {visible.map((suggestion) => (
          <li key={suggestion.id} className="rounded-(--neu-radius-md) bg-surface-sunken p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-primary">
                  {labelFor(suggestion.suggestion_type)}
                  <FinancialStateBadge
                    surface="suggestion"
                    status={suggestion.review_state}
                    labels={stateLabels}
                  />
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {[
                    suggestion.due_date ? `due ${formatDate(suggestion.due_date)}` : null,
                    suggestion.amount && suggestion.currency ? `${suggestion.amount} ${suggestion.currency}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {canWrite && suggestion.review_state === "waiting_confirmation" && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    className="px-3 py-1.5 text-xs"
                    isLoading={isPending && pendingId === suggestion.id}
                    onClick={() => run(suggestion.id, "confirm")}
                  >
                    <CheckIcon size={14} /> Confirm
                  </Button>
                  <Button
                    type="button"
                    className="px-3 py-1.5 text-xs"
                    variant="secondary"
                    disabled={isPending}
                    onClick={() => run(suggestion.id, "reject")}
                  >
                    <XIcon size={14} /> Reject
                  </Button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}

function labelFor(type: string): string {
  return type.replaceAll("_", " ").replace(/^\w/, (char) => char.toUpperCase());
}
