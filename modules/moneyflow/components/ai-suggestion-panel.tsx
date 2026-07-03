"use client";

import { useState, useTransition } from "react";
import { SparklesIcon, CheckIcon, XIcon } from "lucide-react";
import { categorizeTransactionAction } from "../actions/categorize-transaction.action";
import {
  acceptMoneyAiSuggestionAction,
  rejectMoneyAiSuggestionAction,
} from "../actions/review-ai-suggestion.action";

interface AiSuggestionPanelProps {
  transactionId: string;
  categorizationStatus: string;
  hasCategory: boolean;
  suggestion: {
    id: string;
    suggested_category_id: string | null;
    suggested_category_name: string | null;
    confidence: number;
    reasoning: string | null;
    source: "history" | "system" | "ai";
  } | null;
  /** Selectable categories matching the transaction type, for "Change category". */
  categories: Array<{ id: string; name: string }>;
}

/**
 * "AI Categorization" block on the transaction detail page (spec §12.2).
 * English copy matches the rest of this page (it is not dict-driven yet).
 */
export function AiSuggestionPanel({
  transactionId,
  categorizationStatus,
  hasCategory,
  suggestion,
  categories,
}: AiSuggestionPanelProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [overrideCategoryId, setOverrideCategoryId] = useState<string>("");
  const [changing, setChanging] = useState(false);

  // Nothing to review and nothing to run: confirmed transactions stay quiet.
  if (hasCategory && !suggestion) return null;

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      setError(result.error ?? null);
    });
  }

  return (
    <section className="soft-card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
        <SparklesIcon size={16} className="text-text-secondary" /> AI Categorization
      </h2>

      {suggestion ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-text-primary">
            Suggested category:{" "}
            <span className="font-semibold">{suggestion.suggested_category_name ?? "Unknown"}</span>
          </p>
          <p className="text-sm text-text-muted">
            Confidence: {Math.round(Number(suggestion.confidence) * 100)}%
            {suggestion.source !== "ai" && ` · based on ${suggestion.source === "history" ? "your history" : "built-in rules"}`}
          </p>
          {suggestion.reasoning && (
            <p className="text-sm leading-6 text-text-muted">{suggestion.reasoning}</p>
          )}

          {changing && (
            <select
              value={overrideCategoryId}
              onChange={(event) => setOverrideCategoryId(event.target.value)}
              className="soft-control min-h-10 w-full max-w-xs px-3 text-sm"
            >
              <option value="">Pick a category…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          )}

          <div className="flex flex-wrap gap-2">
            {changing ? (
              <button
                type="button"
                disabled={pending || !overrideCategoryId}
                onClick={() =>
                  run(() =>
                    acceptMoneyAiSuggestionAction({
                      suggestionId: suggestion.id,
                      overrideCategoryId,
                    }),
                  )
                }
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-accent-green-soft px-4 text-sm font-semibold text-accent-green disabled:opacity-50"
              >
                <CheckIcon size={14} /> Apply category
              </button>
            ) : (
              <button
                type="button"
                disabled={pending || !suggestion.suggested_category_id}
                onClick={() => run(() => acceptMoneyAiSuggestionAction({ suggestionId: suggestion.id }))}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-accent-green-soft px-4 text-sm font-semibold text-accent-green disabled:opacity-50"
              >
                <CheckIcon size={14} /> Accept
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => setChanging((value) => !value)}
              className="min-h-10 rounded-lg bg-surface-sunken px-4 text-sm font-semibold text-text-secondary disabled:opacity-50"
            >
              {changing ? "Keep suggestion" : "Change category"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => rejectMoneyAiSuggestionAction({ suggestionId: suggestion.id }))}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-surface-sunken px-4 text-sm font-semibold text-text-secondary disabled:opacity-50"
            >
              <XIcon size={14} /> Reject
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-text-muted">
            {categorizationStatus === "failed"
              ? "The last categorization attempt failed. You can retry or pick a category manually."
              : "This transaction has no category yet. Run smart categorization — your rules and history are checked before AI."}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => categorizeTransactionAction({ transactionId }))}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-text-primary px-4 text-sm font-semibold text-text-inverse disabled:opacity-50"
          >
            <SparklesIcon size={14} /> {pending ? "Analyzing…" : "Suggest category"}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-accent-pink">{error}</p>}
    </section>
  );
}
