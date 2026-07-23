"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WalletIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Modal } from "@/shared/ui/modal";
import { Select } from "@/shared/ui/select";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { ACCOUNT_TYPES } from "../constants/moneyflow.constants";
import {
  createAccountForObligationAction,
  type InlineObligationAccountResult,
  type ObligationKind,
} from "../actions/create-account-for-obligation.action";

type InlineAccountDict = Dictionary["money"]["inlineAccount"];
type AccountTypeDict = Dictionary["money"]["accounts"]["types"];

/**
 * Shown on an obligation that cannot be paid because the organization has no
 * account in its currency. It explains WHY the action is blocked and resolves
 * it in place, instead of leaving an inert button and a muted hint.
 *
 * Creating an account records no money — the payment still goes through the
 * explicit Mark-as-paid workflow afterwards.
 */
export function InlineAccountPrompt({
  obligationKind,
  obligationId,
  currency,
  t,
  accountTypes,
}: {
  obligationKind: ObligationKind;
  obligationId: string;
  /** Display only — the server re-derives the authoritative currency. */
  currency: string;
  t: InlineAccountDict;
  accountTypes: AccountTypeDict;
}) {
  const router = useRouter();
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

  const ctaLabel = t.cta.replaceAll("{currency}", currency);

  return (
    <div className="rounded-(--neu-radius-md) border border-border-subtle bg-surface-sunken p-3">
      <p className="text-sm font-medium text-text-primary">{t.title}</p>
      <p className="mt-1 text-xs text-text-secondary">{t.body.replaceAll("{currency}", currency)}</p>
      <Button type="button" variant="secondary" onClick={openDialog} className="mt-3">
        <WalletIcon size={15} className="mr-1.5" /> {ctaLabel}
      </Button>

      <Modal isOpen={isOpen} onClose={closeDialog} title={ctaLabel} closeLabel={t.close}>
        <InlineAccountForm
          key={requestId}
          obligationKind={obligationKind}
          obligationId={obligationId}
          requestId={requestId}
          currency={currency}
          t={t}
          accountTypes={accountTypes}
          onPendingChange={setIsSubmitting}
          onCancel={closeDialog}
          onSuccess={() => {
            setIsOpen(false);
            // The parent page supplies `accounts` — refresh so the account
            // selector and Mark-as-paid become usable immediately.
            router.refresh();
          }}
        />
      </Modal>
    </div>
  );
}

function InlineAccountForm({
  obligationKind,
  obligationId,
  requestId,
  currency,
  t,
  accountTypes,
  onPendingChange,
  onCancel,
  onSuccess,
}: {
  obligationKind: ObligationKind;
  obligationId: string;
  requestId: string;
  currency: string;
  t: InlineAccountDict;
  accountTypes: AccountTypeDict;
  onPendingChange: (pending: boolean) => void;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState<InlineObligationAccountResult, FormData>(
    async (previousState, formData) => {
      const result = await createAccountForObligationAction(previousState, formData);
      if (result.account) onSuccess();
      return result;
    },
    {},
  );

  useEffect(() => {
    onPendingChange(isPending);
    return () => onPendingChange(false);
  }, [isPending, onPendingChange]);

  const typeOptions = ACCOUNT_TYPES.map((type) => ({ value: type, label: accountTypes[type] }));

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="obligationKind" value={obligationKind} />
      <input type="hidden" name="obligationId" value={obligationId} />
      <input type="hidden" name="creationRequestId" value={requestId} />

      {state.error && (
        <div
          className="rounded-(--neu-radius-md) border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {state.error}
        </div>
      )}

      <Input
        id="inline-obligation-account-name"
        name="name"
        label={t.nameLabel}
        defaultValue={t.defaultName.replaceAll("{currency}", currency)}
        required
        maxLength={100}
        error={state.fieldErrors?.name?.[0]}
      />

      <Input id="inline-obligation-account-currency" label={t.currencyLabel} value={currency} disabled readOnly />

      <Select
        id="inline-obligation-account-type"
        name="type"
        label={t.typeLabel}
        options={typeOptions}
        defaultValue="card"
        disabled={isPending}
        error={state.fieldErrors?.type?.[0]}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
          {t.cancel}
        </Button>
        <Button type="submit" isLoading={isPending}>
          {t.submit}
        </Button>
      </div>
    </form>
  );
}
