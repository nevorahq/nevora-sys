"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircleIcon, PencilIcon, SkipForwardIcon, XCircleIcon, WalletIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { formatMoney } from "@/shared/utils/format-money";
import { formatDate } from "@/shared/utils/format-date";
import { ROUTES } from "@/shared/config/routes";
import { FinancialStateBadge } from "@/modules/moneyflow/components/financial-state-badge";
import { InlineAccountPrompt } from "@/modules/moneyflow/components/inline-account-prompt";
import type { TaskContextType, FinancialTaskStatus } from "../constants/task.constants";
import { markFinancialTaskPaidAction } from "../actions/mark-financial-task-paid.action";
import { setFinancialTaskAmountAction } from "../actions/set-financial-task-amount.action";
import { skipFinancialTaskAction, dismissFinancialTaskAction } from "../actions/resolve-financial-task.action";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

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
  t: Dictionary["financialTask"];
  /** Canonical financial-state labels (`dict.money.states`) for the status badge. */
  stateLabels: Dictionary["money"]["states"];
  /** Copy for the inline "no money account yet" resolution. */
  inlineAccount: Dictionary["money"]["inlineAccount"];
  accountTypeLabels: Dictionary["money"]["accounts"]["types"];
}

/**
 * Financial Context panel on a task detail page (spec §15). Shown for one-off
 * financial tasks (task_context_type != standard, not backed by a subscription
 * cycle). Routes Mark-as-paid through the idempotent one-off flow, and offers
 * Skip / Dismiss for obligations settled elsewhere or false positives.
 */
export function FinancialTaskPanel({
  task,
  accounts,
  canWrite,
  t,
  stateLabels,
  inlineAccount,
  accountTypeLabels,
}: Props) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isOpen = task.financial_status === "open";
  const canPay = Boolean(task.amount && task.amount > 0 && task.currency);

  // Amount editor: a capture without a number ("оплатить аренду 20 числа") creates
  // an amountless task that Mark-as-paid refuses. When the amount is missing the
  // editor is shown by default (the prompt); when it exists, behind an Edit toggle.
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountInput, setAmountInput] = useState(task.amount != null ? String(task.amount) : "");
  const [currencyInput, setCurrencyInput] = useState(task.currency ?? accounts[0]?.currency ?? "");
  const amountEditorOpen = isOpen && canWrite && (!canPay || editingAmount);

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
    });
  }

  function saveAmount() {
    const amount = Number(amountInput.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t.amountGtZero);
      return;
    }
    if (currencyInput.trim().length !== 3) {
      setError(t.currencyCode);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await setFinancialTaskAmountAction({ taskId: task.id, amount, currency: currencyInput.trim() });
      if (res.error) {
        setError(res.error);
        return;
      }
      setEditingAmount(false);
      router.refresh();
    });
  }

  return (
    <section className="soft-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <WalletIcon size={18} className="text-accent-lilac" />
          <h2 className="text-base font-semibold text-text-primary">{t.title}</h2>
        </div>
        <FinancialStateBadge
          surface="financial_task"
          status={task.financial_status}
          labels={stateLabels}
          dueDate={task.financial_due_date}
          className="px-2.5 py-1"
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">{t.type}</dt>
          <dd className="mt-1 text-text-primary">{t.types[task.task_context_type]}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">{t.provider}</dt>
          <dd className="mt-1 text-text-primary">{task.provider_name?.trim() || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">{t.amount}</dt>
          <dd className="mt-1 flex items-center gap-2 text-text-primary">
            {task.amount != null ? `${formatMoney(Number(task.amount))} ${task.currency ?? ""}` : "—"}
            {canWrite && isOpen && canPay && !editingAmount && (
              <button
                type="button"
                onClick={() => setEditingAmount(true)}
                className="text-text-muted hover:text-text-primary"
                aria-label={t.editAmount}
              >
                <PencilIcon size={13} />
              </button>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">{t.paymentDate}</dt>
          <dd className="mt-1 text-text-primary">{task.financial_due_date ? formatDate(task.financial_due_date) : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">{t.actionDue}</dt>
          <dd className="mt-1 text-text-primary">{task.due_date ? formatDate(task.due_date) : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">{t.reminderOffset}</dt>
          <dd className="mt-1 text-text-primary">{t.daysBefore.replace("{days}", String(task.reminder_offset_days))}</dd>
        </div>
      </dl>

      {task.source_document_id && (
        <p className="mt-4 text-xs text-text-muted">
          <Link href={`${ROUTES.documents}/${task.source_document_id}`} className="underline hover:text-text-primary">
            {t.viewSourceDocument}
          </Link>
        </p>
      )}

      {task.financial_status === "paid" && task.financial_transaction_id && (
        <p className="mt-4 text-xs text-text-muted">
          <Link href={`${ROUTES.money}/${task.financial_transaction_id}`} className="underline hover:text-text-primary">
            {t.viewPostedTransaction}
          </Link>
        </p>
      )}

      {canWrite && isOpen && (
        <div className="mt-5 space-y-3 border-t border-border pt-4">
          {/* Amount editor. Missing amount → shown by default so the obligation can
              be priced before paying; present amount → opened via the Edit pencil. */}
          {amountEditorOpen && (
            <div className="space-y-2 rounded-(--neu-radius) bg-surface-sunken p-3">
              {!canPay && (
                <p className="text-xs text-text-secondary">{t.capturedWithoutAmount}</p>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Input
                    id="fin-task-amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    label={t.amount}
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                  />
                </div>
                <Input
                  id="fin-task-currency"
                  label={t.currency}
                  value={currencyInput}
                  maxLength={3}
                  className="uppercase"
                  onChange={(e) => setCurrencyInput(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" isLoading={isPending} onClick={saveAmount}>
                  {t.saveAmount}
                </Button>
                {canPay && (
                  <Button type="button" variant="ghost" disabled={isPending} onClick={() => setEditingAmount(false)}>
                    {t.cancel}
                  </Button>
                )}
              </div>
            </div>
          )}

          {canPay && !editingAmount && (
            accounts.length > 0 ? (
              <Select
                id="fin-task-pay-account"
                label={t.payFromAccount}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                options={accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))}
              />
            ) : (
              <InlineAccountPrompt
                obligationKind="financial_task"
                obligationId={task.id}
                currency={task.currency ?? ""}
                t={inlineAccount}
                accountTypes={accountTypeLabels}
              />
            )
          )}
          <div className="flex flex-wrap gap-2">
            {canPay && !editingAmount && (
              <Button
                type="button"
                isLoading={isPending}
                disabled={!accountId || accounts.length === 0}
                onClick={() => run(() => markFinancialTaskPaidAction({ taskId: task.id, accountId }))}
              >
                <CheckCircleIcon size={15} className="mr-1.5" /> {t.markAsPaid}
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => run(() => skipFinancialTaskAction({ taskId: task.id }))}
            >
              <SkipForwardIcon size={15} className="mr-1.5" /> {t.skip}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => run(() => dismissFinancialTaskAction({ taskId: task.id }))}
            >
              <XCircleIcon size={15} className="mr-1.5" /> {t.dismiss}
            </Button>
          </div>
          <p className="text-xs text-text-muted">{t.markingNote}</p>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">{error}</p>
      )}
    </section>
  );
}
