"use client";

import { useState, useTransition } from "react";
import { SparklesIcon, CheckIcon, XIcon } from "lucide-react";
import { formatMoney } from "@/shared/utils/format-money";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { UncategorizedTransaction } from "../queries/get-uncategorized-transactions";
import { bulkCategorizeTransactionsAction, categorizeTransactionAction } from "../actions/categorize-transaction.action";
import {
  acceptMoneyAiSuggestionAction,
  rejectMoneyAiSuggestionAction,
} from "../actions/review-ai-suggestion.action";

interface UncategorizedTransactionsProps {
  transactions: UncategorizedTransaction[];
  labels: Dictionary["money"]["intelligence"];
}

/**
 * Uncategorized queue (Phase 5, spec §12.4): every posted income/expense
 * without a confirmed category. Per row: run the pipeline, or review the
 * pending suggestion inline. The bulk button categorizes up to 20 at once —
 * rules apply directly, softer signals only create suggestions.
 */
export function UncategorizedTransactions({ transactions, labels }: UncategorizedTransactionsProps) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function runBulk() {
    setNotice(null);
    startTransition(async () => {
      const ids = transactions.filter((tx) => !tx.pendingSuggestion).slice(0, 20).map((tx) => tx.id);
      if (ids.length === 0) return;
      const result = await bulkCategorizeTransactionsAction({ transactionIds: ids });
      if (result.error) {
        setNotice(result.error);
        return;
      }
      setNotice(
        labels.bulkResult
          .replace("{rules}", String(result.ruleApplied))
          .replace("{suggested}", String(result.suggested)),
      );
    });
  }

  function runOne(transactionId: string) {
    setBusyId(transactionId);
    setNotice(null);
    startTransition(async () => {
      const result = await categorizeTransactionAction({ transactionId });
      if (result.error) setNotice(result.error);
      else if (result.outcome === "ai_quota_exceeded") setNotice(labels.quotaExceeded);
      else if (result.outcome === "ai_failed") setNotice(labels.actionFailed);
      setBusyId(null);
    });
  }

  function review(suggestionId: string, transactionId: string, accept: boolean) {
    setBusyId(transactionId);
    setNotice(null);
    startTransition(async () => {
      const result = accept
        ? await acceptMoneyAiSuggestionAction({ suggestionId })
        : await rejectMoneyAiSuggestionAction({ suggestionId });
      if (result.error) setNotice(result.error);
      setBusyId(null);
    });
  }

  if (transactions.length === 0) {
    return (
      <div className="soft-card p-5 text-sm text-text-muted">{labels.empty}</div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          {labels.uncategorizedTitle} · {transactions.length}
        </h2>
        <button
          type="button"
          onClick={runBulk}
          disabled={pending}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-text-primary px-3 text-sm font-semibold text-text-inverse disabled:opacity-50"
        >
          <SparklesIcon size={14} />
          {pending && !busyId ? labels.categorizing : labels.categorizeAll}
        </button>
      </div>

      {notice && <p className="mb-3 text-sm text-text-muted">{notice}</p>}

      <div className="flex flex-col gap-2.5">
        {transactions.map((tx) => {
          const suggestion = tx.pendingSuggestion;
          const busy = pending && busyId === tx.id;
          return (
            <div key={tx.id} className="soft-card-sm flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">{tx.title}</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {tx.transaction_date}
                  {tx.account ? ` · ${tx.account.name}` : ""}
                  {suggestion && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-accent-lilac-soft px-2 py-0.5 text-xs font-medium text-text-secondary">
                      <SparklesIcon size={11} />
                      {labels.suggestedLabel} {suggestion.suggested_category_name ?? "—"}
                      {" · "}
                      {Math.round(Number(suggestion.confidence) * 100)}%
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${tx.type === "income" ? "text-accent-green" : "text-accent-pink"}`}>
                  {tx.type === "income" ? "+" : "−"}{tx.currency} {formatMoney(Number(tx.amount))}
                </span>

                {suggestion ? (
                  <>
                    <button
                      type="button"
                      onClick={() => review(suggestion.id, tx.id, true)}
                      disabled={busy || !suggestion.suggested_category_id}
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-accent-green-soft px-3 text-xs font-semibold text-accent-green disabled:opacity-50"
                    >
                      <CheckIcon size={13} /> {labels.accept}
                    </button>
                    <button
                      type="button"
                      onClick={() => review(suggestion.id, tx.id, false)}
                      disabled={busy}
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-surface-sunken px-3 text-xs font-semibold text-text-secondary disabled:opacity-50"
                    >
                      <XIcon size={13} /> {labels.reject}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => runOne(tx.id)}
                    disabled={busy}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-surface-sunken px-3 text-xs font-semibold text-text-secondary disabled:opacity-50"
                  >
                    <SparklesIcon size={13} />
                    {busy ? labels.categorizing : labels.suggest}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
