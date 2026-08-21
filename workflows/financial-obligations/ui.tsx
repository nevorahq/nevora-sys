"use client";

import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import {
  createAccountForObligationAction,
  markFinancialTaskPaidAction,
  markSubscriptionPaymentAction,
} from "./actions";
import { InlineAccountPrompt } from "@/modules/moneyflow/ui";
import {
  FinancialTaskPanel as TaskFinancialPanel,
  type FinancialTaskPanelProps,
} from "@/modules/tasks/ui";
import {
  SubscriptionPaymentTaskPanel as SubtrackerPaymentTaskPanel,
  SubscriptionPaymentWorkflowPanel as SubtrackerPaymentWorkflowPanel,
  type SubscriptionPaymentTaskPanelProps,
  type SubscriptionPaymentWorkflowPanelProps,
} from "@/modules/subtracker/ui";

interface AccountPromptCopy {
  inlineAccount: Dictionary["money"]["inlineAccount"];
  accountTypeLabels: Dictionary["money"]["accounts"]["types"];
}

export type FinancialTaskWorkflowPanelProps = Omit<
  FinancialTaskPanelProps,
  "emptyAccountPrompt" | "onMarkAsPaid"
> & AccountPromptCopy;

export function FinancialTaskWorkflowPanel({
  inlineAccount,
  accountTypeLabels,
  ...props
}: FinancialTaskWorkflowPanelProps) {
  return (
    <TaskFinancialPanel
      {...props}
      onMarkAsPaid={markFinancialTaskPaidAction}
      emptyAccountPrompt={
        <InlineAccountPrompt
          obligationKind="financial_task"
          obligationId={props.task.id}
          currency={props.task.currency ?? ""}
          t={inlineAccount}
          accountTypes={accountTypeLabels}
          onCreateAccount={createAccountForObligationAction}
        />
      }
    />
  );
}

export type SubscriptionPaymentTaskWorkflowPanelProps = Omit<
  SubscriptionPaymentTaskPanelProps,
  "emptyAccountPrompt" | "onMarkAsPaid"
> & AccountPromptCopy;

export function SubscriptionPaymentTaskWorkflowPanel({
  inlineAccount,
  accountTypeLabels,
  ...props
}: SubscriptionPaymentTaskWorkflowPanelProps) {
  return (
    <SubtrackerPaymentTaskPanel
      {...props}
      onMarkAsPaid={markSubscriptionPaymentAction}
      emptyAccountPrompt={
        <InlineAccountPrompt
          obligationKind="subscription_cycle"
          obligationId={props.cycle.id}
          currency={props.cycle.currency}
          t={inlineAccount}
          accountTypes={accountTypeLabels}
          onCreateAccount={createAccountForObligationAction}
        />
      }
    />
  );
}

export type SubscriptionPaymentWorkflowPanelPropsWithAccountPrompt = Omit<
  SubscriptionPaymentWorkflowPanelProps,
  "emptyAccountPrompt" | "onMarkAsPaid"
> & AccountPromptCopy;

export function SubscriptionPaymentWorkflowPanel({
  inlineAccount,
  accountTypeLabels,
  ...props
}: SubscriptionPaymentWorkflowPanelPropsWithAccountPrompt) {
  const cycle = props.currentCycle;

  return (
    <SubtrackerPaymentWorkflowPanel
      {...props}
      onMarkAsPaid={markSubscriptionPaymentAction}
      emptyAccountPrompt={
        cycle ? (
          <InlineAccountPrompt
            obligationKind="subscription_cycle"
            obligationId={cycle.id}
            currency={cycle.currency}
            t={inlineAccount}
            accountTypes={accountTypeLabels}
            onCreateAccount={createAccountForObligationAction}
          />
        ) : null
      }
    />
  );
}
