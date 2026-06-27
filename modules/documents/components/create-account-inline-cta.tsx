"use client";

import { useActionState, useEffect, useState } from "react";
import { WalletIcon } from "lucide-react";
import {
  createAccountForDocumentExpenseAction,
  type InlineAccountCreationResult,
} from "@/modules/moneyflow/actions/create-account-for-document-expense.action";
import { ACCOUNT_TYPES } from "@/modules/moneyflow/constants/moneyflow.constants";
import type { MoneyAccountOption } from "@/modules/moneyflow/services/money-account-service";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Select } from "@/shared/ui/select";

export function CreateAccountInlineCTA({
  transactionId,
  currency,
  onAccountReady,
}: {
  transactionId: string;
  currency: string;
  onAccountReady: (account: MoneyAccountOption, created: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestId, setRequestId] = useState("");

  function openDialog() {
    setRequestId(crypto.randomUUID());
    setIsOpen(true);
  }

  function closeDialog() {
    if (!isSubmitting) setIsOpen(false);
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-accent-yellow">
          This is a {currency} expense, but you have no active {currency} account.
        </p>
        <Button type="button" variant="secondary" onClick={openDialog} className="shrink-0">
          <WalletIcon size={15} /> Create {currency} account
        </Button>
      </div>

      <Modal
        isOpen={isOpen}
        onClose={closeDialog}
        title={`Create ${currency} account`}
        closeLabel="Close"
      >
        <CreateInlineAccountForm
          key={requestId}
          transactionId={transactionId}
          requestId={requestId}
          currency={currency}
          onPendingChange={setIsSubmitting}
          onCancel={closeDialog}
          onSuccess={(account, created) => {
            setIsOpen(false);
            onAccountReady(account, created);
          }}
        />
      </Modal>
    </>
  );
}

function CreateInlineAccountForm({
  transactionId,
  requestId,
  currency,
  onPendingChange,
  onCancel,
  onSuccess,
}: {
  transactionId: string;
  requestId: string;
  currency: string;
  onPendingChange: (pending: boolean) => void;
  onCancel: () => void;
  onSuccess: (account: MoneyAccountOption, created: boolean) => void;
}) {
  const [state, formAction, isPending] = useActionState<InlineAccountCreationResult, FormData>(
    async (previousState, formData) => {
      const result = await createAccountForDocumentExpenseAction(previousState, formData);
      if (result.account) onSuccess(result.account, result.created === true);
      return result;
    },
    {},
  );

  useEffect(() => {
    onPendingChange(isPending);
    return () => onPendingChange(false);
  }, [isPending, onPendingChange]);

  const typeOptions = ACCOUNT_TYPES.map((type) => ({
    value: type,
    label: type.charAt(0).toUpperCase() + type.slice(1),
  }));

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="transactionId" value={transactionId} />
      <input type="hidden" name="creationRequestId" value={requestId} />

      {state.error && (
        <div className="rounded-(--neu-radius-md) border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </div>
      )}

      <Input
        id="inline-account-name"
        name="name"
        label="Account name"
        defaultValue={`${currency} Account`}
        required
        maxLength={100}
        error={state.fieldErrors?.name?.[0]}
      />

      <Input id="inline-account-currency" label="Currency" value={currency} disabled readOnly />

      <Select
        id="inline-account-type"
        name="type"
        label="Account type"
        options={typeOptions}
        defaultValue="card"
        disabled={isPending}
        error={state.fieldErrors?.type?.[0]}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isPending}>
          Create account
        </Button>
      </div>
    </form>
  );
}
