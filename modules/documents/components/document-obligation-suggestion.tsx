"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { SparklesIcon, CheckIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { formatMoney } from "@/shared/utils/format-money";
import { formatDate } from "@/shared/utils/format-date";
import { ROUTES } from "@/shared/config/routes";
import { TASK_CONTEXT_TYPE_LABELS, type TaskContextType } from "@/modules/tasks/constants/task.constants";
import { createFinancialTaskFromDocumentAction } from "@/modules/tasks/actions/create-financial-task-from-document.action";

export interface ObligationSuggestion {
  contextType: Exclude<TaskContextType, "standard">;
  providerName: string | null;
  amount: number | null;
  currency: string | null;
  financialDueDate: string | null;
  reminderOffsetDays: number;
}

interface Props {
  documentId: string;
  suggestion: ObligationSuggestion;
  /** Task id if a financial task already exists for this document. */
  existingTaskId: string | null;
  canCreate: boolean;
}

/**
 * "AI detected a possible financial obligation" card on the document detail page
 * (spec §15). Lets the user confirm a detected obligation into a Financial
 * Context Task. Never posts a transaction — that only happens on Mark-as-paid.
 */
export function DocumentObligationSuggestion({ documentId, suggestion, existingTaskId, canCreate }: Props) {
  const [taskId, setTaskId] = useState<string | null>(existingTaskId);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const missingDueDate = !suggestion.financialDueDate;

  function create() {
    if (!suggestion.financialDueDate) {
      setError("Add a payment date to create a task.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createFinancialTaskFromDocumentAction({
        sourceDocumentId: documentId,
        contextType: suggestion.contextType,
        providerName: suggestion.providerName,
        amount: suggestion.amount,
        currency: suggestion.currency,
        financialDueDate: suggestion.financialDueDate as string,
        reminderOffsetDays: suggestion.reminderOffsetDays,
      });
      if (res.error) setError(res.error);
      else if (res.taskId) setTaskId(res.taskId);
    });
  }

  return (
    <section className="soft-card border border-accent-lilac/30 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <SparklesIcon size={18} className="text-accent-lilac" />
        <h2 className="text-base font-semibold text-text-primary">AI detected a possible financial obligation</h2>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">Type</dt>
          <dd className="mt-1 text-text-primary">{TASK_CONTEXT_TYPE_LABELS[suggestion.contextType]}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">Provider</dt>
          <dd className="mt-1 text-text-primary">{suggestion.providerName?.trim() || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">Amount</dt>
          <dd className="mt-1 text-text-primary">
            {suggestion.amount != null ? `${formatMoney(Number(suggestion.amount))} ${suggestion.currency ?? ""}` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">Payment date</dt>
          <dd className="mt-1 text-text-primary">{suggestion.financialDueDate ? formatDate(suggestion.financialDueDate) : "—"}</dd>
        </div>
      </dl>

      {taskId ? (
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success">
          <CheckIcon size={13} /> Financial task created ·{" "}
          <Link href={`${ROUTES.tasks}/${taskId}`} className="underline">View task</Link>
        </p>
      ) : (
        canCreate && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={create} isLoading={isPending} disabled={missingDueDate}>
              Create task
            </Button>
            <p className="text-xs text-text-muted">
              A reminder task is created {suggestion.reminderOffsetDays} days before the payment date. No money is moved.
            </p>
          </div>
        )
      )}

      {missingDueDate && !taskId && (
        <p className="mt-2 text-xs text-text-muted">No payment date was detected — open the document to confirm details before creating a task.</p>
      )}

      {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}
