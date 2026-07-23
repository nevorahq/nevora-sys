"use client";

import { useState, useTransition } from "react";
import { CheckCircleIcon, RepeatIcon, SkipForwardIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/select";
import { formatMoney } from "@/shared/utils/format-money";
import { formatDate } from "@/shared/utils/format-date";
import { ROUTES } from "@/shared/config/routes";
import { FinancialStateBadge } from "@/modules/moneyflow/components/financial-state-badge";
import { InlineAccountPrompt } from "@/modules/moneyflow/components/inline-account-prompt";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { markSubscriptionPaymentAction } from "../actions/mark-subscription-payment.action";
import { skipSubscriptionPaymentAction } from "../actions/skip-subscription-payment.action";
import type { SubscriptionPaymentCycle } from "../types/payment-cycle.types";

interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

interface Props {
  cycle: SubscriptionPaymentCycle;
  providerName: string;
  accounts: AccountOption[];
  canWrite: boolean;
  /** Canonical financial-state labels (`dict.money.states`) for the cycle badge. */
  stateLabels: Dictionary["money"]["states"];
  /** Copy for the inline "no money account yet" resolution. */
  inlineAccount: Dictionary["money"]["inlineAccount"];
  accountTypeLabels: Dictionary["money"]["accounts"]["types"];
}

/**
 * Rendered on a task detail page when the task is a subscription payment task.
 * Routes completion through the specialized Mark-as-paid flow — NOT generic
 * task completion — so the expense + next cycle are created correctly.
 */
export function SubscriptionPaymentTaskPanel({
  cycle,
  providerName,
  accounts,
  canWrite,
  stateLabels,
  inlineAccount,
  accountTypeLabels,
}: Props) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isOpen = cycle.status === "planned" || cycle.status === "task_open";

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
    });
  }

  return (
    <section className="soft-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RepeatIcon size={18} className="text-accent-lilac" />
          <h2 className="text-base font-semibold text-text-primary">Subscription payment</h2>
        </div>
        <FinancialStateBadge
          surface="subscription_cycle"
          status={cycle.status}
          labels={stateLabels}
          dueDate={cycle.due_date}
          className="px-3 py-1"
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">Provider</dt>
          <dd className="mt-1">
            <Link
              href={`${ROUTES.subscriptions}/${cycle.subscription_id}`}
              className="font-medium text-text-secondary underline hover:text-text-primary"
            >
              {providerName}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">Billing period</dt>
          <dd className="mt-1 text-text-primary">{cycle.billing_period_key}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">Amount</dt>
          <dd className="mt-1 text-text-primary">
            {formatMoney(Number(cycle.expected_amount))} {cycle.currency}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">Due date</dt>
          <dd className="mt-1 text-text-primary">{formatDate(cycle.due_date)}</dd>
        </div>
      </dl>

      {canWrite && isOpen && (
        <div className="mt-4 space-y-3">
          {accounts.length > 0 ? (
            <Select
              id="task-pay-account"
              label="Pay from account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              options={accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))}
            />
          ) : (
            <InlineAccountPrompt
              obligationKind="subscription_cycle"
              obligationId={cycle.id}
              currency={cycle.currency}
              t={inlineAccount}
              accountTypes={accountTypeLabels}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              isLoading={isPending}
              disabled={!accountId || accounts.length === 0}
              onClick={() => run(() => markSubscriptionPaymentAction({ cycleId: cycle.id, accountId }))}
            >
              <CheckCircleIcon size={15} className="mr-1.5" /> Mark as paid
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => run(() => skipSubscriptionPaymentAction({ cycleId: cycle.id }))}
            >
              <SkipForwardIcon size={15} className="mr-1.5" /> Skip
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
