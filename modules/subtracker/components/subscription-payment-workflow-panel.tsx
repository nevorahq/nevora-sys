"use client";

import { useState, useTransition } from "react";
import { CheckCircleIcon, SkipForwardIcon, CalendarClockIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/select";
import { Input } from "@/shared/ui/input";
import { formatMoney } from "@/shared/utils/format-money";
import { formatDate } from "@/shared/utils/format-date";
import { cn } from "@/shared/utils/cn";
import { markSubscriptionPaymentAction } from "../actions/mark-subscription-payment.action";
import { skipSubscriptionPaymentAction } from "../actions/skip-subscription-payment.action";
import { changeSubscriptionPaymentDueDateAction } from "../actions/change-subscription-payment-due-date.action";
import { cancelSubscriptionAction } from "../actions/cancel-subscription.action";
import type { SubscriptionPaymentCycle } from "../types/payment-cycle.types";

interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

interface Props {
  subscriptionId: string;
  isActive: boolean;
  lastPaymentDate: string | null;
  nextPaymentDate: string;
  currentCycle: SubscriptionPaymentCycle | null;
  history: SubscriptionPaymentCycle[];
  accounts: AccountOption[];
  canWrite: boolean;
}

const STATUS_STYLE: Record<string, string> = {
  planned: "bg-surface-sunken text-text-secondary",
  task_open: "bg-info-soft text-info",
  paid: "bg-success-soft text-success",
  skipped: "bg-surface-sunken text-text-muted",
  cancelled: "bg-surface-sunken text-text-muted",
  failed: "bg-danger-soft text-danger",
};

export function SubscriptionPaymentWorkflowPanel({
  subscriptionId,
  isActive,
  lastPaymentDate,
  nextPaymentDate,
  currentCycle,
  history,
  accounts,
  canWrite,
}: Props) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [showDueDate, setShowDueDate] = useState(false);
  const [newDueDate, setNewDueDate] = useState(currentCycle?.due_date ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
    });
  }

  const cycleOpen = currentCycle && (currentCycle.status === "planned" || currentCycle.status === "task_open");

  return (
    <section className="soft-card p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">Payment workflow</h2>
        {!isActive && (
          <span className="rounded-full bg-surface-sunken px-3 py-1 text-xs font-medium text-text-muted">
            Cancelled
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-text-muted">Last payment</p>
          <p className="mt-1 text-text-primary">{lastPaymentDate ? formatDate(lastPaymentDate) : "—"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-text-muted">Next payment</p>
          <p className="mt-1 text-text-primary">{formatDate(nextPaymentDate)}</p>
        </div>
      </div>

      {/* Current cycle */}
      <div className="mt-5 rounded-(--neu-radius-md) border border-border-subtle p-4">
        {currentCycle ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {currentCycle.billing_period_key}
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  Due {formatDate(currentCycle.due_date)} ·{" "}
                  {formatMoney(Number(currentCycle.expected_amount))} {currentCycle.currency}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium capitalize",
                  STATUS_STYLE[currentCycle.status] ?? "bg-surface-sunken text-text-secondary",
                )}
              >
                {currentCycle.status.replace("_", " ")}
              </span>
            </div>

            {canWrite && cycleOpen && (
              <div className="mt-4 space-y-3">
                {accounts.length > 0 ? (
                  <Select
                    id="pay-account"
                    label="Pay from account"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    options={accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))}
                  />
                ) : (
                  <p className="text-xs text-text-muted">Add a money account to record this payment.</p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    isLoading={isPending}
                    disabled={!accountId || accounts.length === 0}
                    onClick={() =>
                      run(() =>
                        markSubscriptionPaymentAction({ cycleId: currentCycle.id, accountId }),
                      )
                    }
                  >
                    <CheckCircleIcon size={15} className="mr-1.5" /> Mark as paid
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPending}
                    onClick={() => run(() => skipSubscriptionPaymentAction({ cycleId: currentCycle.id }))}
                  >
                    <SkipForwardIcon size={15} className="mr-1.5" /> Skip
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => setShowDueDate((v) => !v)}
                  >
                    <CalendarClockIcon size={15} className="mr-1.5" /> Change due date
                  </Button>
                </div>

                {showDueDate && (
                  <div className="flex items-end gap-2">
                    <Input
                      id="new-due-date"
                      type="date"
                      label="New due date"
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isPending || !newDueDate}
                      onClick={() =>
                        run(async () => {
                          const res = await changeSubscriptionPaymentDueDateAction({
                            cycleId: currentCycle.id,
                            newDueDate,
                          });
                          if (!res.error) setShowDueDate(false);
                          return res;
                        })
                      }
                    >
                      Save
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-text-muted">No open payment cycle.</p>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {/* Cancel subscription */}
      {canWrite && isActive && (
        <div className="mt-4">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (confirm("Cancel this subscription? Future payment tasks will stop.")) {
                run(() => cancelSubscriptionAction({ subscriptionId }));
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-danger"
          >
            <XCircleIcon size={13} /> Cancel subscription
          </button>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Payment history</p>
          <ul className="mt-2 divide-y divide-border-subtle">
            {history.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-text-secondary">{c.billing_period_key}</span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums text-text-muted">
                    {formatMoney(Number(c.expected_amount))} {c.currency}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                      STATUS_STYLE[c.status] ?? "bg-surface-sunken text-text-secondary",
                    )}
                  >
                    {c.status.replace("_", " ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
