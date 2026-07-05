"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircleIcon, SkipForwardIcon, XCircleIcon, WalletIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/select";
import { formatMoney } from "@/shared/utils/format-money";
import { formatDate } from "@/shared/utils/format-date";
import { ROUTES } from "@/shared/config/routes";
import { TASK_CONTEXT_TYPE_LABELS, type TaskContextType, type FinancialTaskStatus } from "../constants/task.constants";
import { markFinancialTaskPaidAction } from "../actions/mark-financial-task-paid.action";
import { skipFinancialTaskAction, dismissFinancialTaskAction } from "../actions/resolve-financial-task.action";

interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

export interface FinancialTaskPanelData {
  id: string;
  task_context_type: TaskContextType;
  provider_name: string | null;
  amount: number | null;
  currency: string | null;
  financial_due_date: string | null;
  due_date: string | null;
  reminder_offset_days: number;
  financial_status: FinancialTaskStatus;
  financial_transaction_id: string | null;
  source_document_id: string | null;
}

interface Props {
  task: FinancialTaskPanelData;
  accounts: AccountOption[];
  canWrite: boolean;
}

const STATUS_BADGE: Record<FinancialTaskStatus, { label: string; className: string }> = {
  open:      { label: "Open",      className: "bg-accent-lilac-soft text-accent-lilac" },
  paid:      { label: "Paid",      className: "bg-success-soft text-success" },
  skipped:   { label: "Skipped",   className: "bg-surface-sunken text-text-secondary" },
  dismissed: { label: "Dismissed", className: "bg-surface-sunken text-text-muted" },
};

/**
 * Financial Context panel on a task detail page (spec §15). Shown for one-off
 * financial tasks (task_context_type != standard, not backed by a subscription
 * cycle). Routes Mark-as-paid through the idempotent one-off flow, and offers
 * Skip / Dismiss for obligations settled elsewhere or false positives.
 */
export function FinancialTaskPanel({ task, accounts, canWrite }: Props) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isOpen = task.financial_status === "open";
  const badge = STATUS_BADGE[task.financial_status];
  const canPay = Boolean(task.amount && task.amount > 0 && task.currency);

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
    });
  }

  return (
    <section className="soft-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <WalletIcon size={18} className="text-accent-lilac" />
          <h2 className="text-base font-semibold text-text-primary">Financial context</h2>
        </div>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>{badge.label}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">Type</dt>
          <dd className="mt-1 text-text-primary">{TASK_CONTEXT_TYPE_LABELS[task.task_context_type]}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">Provider</dt>
          <dd className="mt-1 text-text-primary">{task.provider_name?.trim() || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">Amount</dt>
          <dd className="mt-1 text-text-primary">
            {task.amount != null ? `${formatMoney(Number(task.amount))} ${task.currency ?? ""}` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">Payment date</dt>
          <dd className="mt-1 text-text-primary">{task.financial_due_date ? formatDate(task.financial_due_date) : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">Action due</dt>
          <dd className="mt-1 text-text-primary">{task.due_date ? formatDate(task.due_date) : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">Reminder offset</dt>
          <dd className="mt-1 text-text-primary">{task.reminder_offset_days} days before</dd>
        </div>
      </dl>

      {task.source_document_id && (
        <p className="mt-4 text-xs text-text-muted">
          <Link href={`${ROUTES.documents}/${task.source_document_id}`} className="underline hover:text-text-primary">
            View source document
          </Link>
        </p>
      )}

      {task.financial_status === "paid" && task.financial_transaction_id && (
        <p className="mt-4 text-xs text-text-muted">
          <Link href={`${ROUTES.money}/${task.financial_transaction_id}`} className="underline hover:text-text-primary">
            View posted transaction
          </Link>
        </p>
      )}

      {canWrite && isOpen && (
        <div className="mt-5 space-y-3 border-t border-border pt-4">
          {canPay && (
            accounts.length > 0 ? (
              <Select
                id="fin-task-pay-account"
                label="Pay from account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                options={accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))}
              />
            ) : (
              <p className="text-xs text-text-muted">Add a money account to record this payment.</p>
            )
          )}
          <div className="flex flex-wrap gap-2">
            {canPay && (
              <Button
                type="button"
                isLoading={isPending}
                disabled={!accountId || accounts.length === 0}
                onClick={() => run(() => markFinancialTaskPaidAction({ taskId: task.id, accountId }))}
              >
                <CheckCircleIcon size={15} className="mr-1.5" /> Mark as paid
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => run(() => skipFinancialTaskAction({ taskId: task.id }))}
            >
              <SkipForwardIcon size={15} className="mr-1.5" /> Skip
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => run(() => dismissFinancialTaskAction({ taskId: task.id }))}
            >
              <XCircleIcon size={15} className="mr-1.5" /> Dismiss
            </Button>
          </div>
          <p className="text-xs text-text-muted">
            Marking as paid posts a single expense to Money. Until then this is a planned obligation and does not affect your balance.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">{error}</p>
      )}
    </section>
  );
}
