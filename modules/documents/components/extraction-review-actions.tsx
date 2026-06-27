"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { confirmDocumentTransactionAction } from "@/modules/moneyflow/actions/confirm-document-transaction.action";
import { rejectDocumentTransactionAction } from "@/modules/moneyflow/actions/reject-document-transaction.action";
import { retryDocumentExtractionAction } from "../actions/retry-document-extraction.action";

/**
 * Confirm / Reject / Retry controls for a document's extracted draft.
 * Each calls its server action; the server is the source of truth (RLS +
 * permission + status + currency guards), this only drives the UI.
 *
 * Currency picker: a draft can only post onto a same-currency account. When the
 * draft's auto-assigned account differs in currency (`needsAccount`), the user
 * must pick a compatible account; if none exist they're told to create one.
 */
export function ExtractionReviewActions({
  documentId,
  transactionId,
  canConfirm,
  needsAccount = false,
  requiredCurrency = null,
  compatibleAccounts = [],
}: {
  documentId: string;
  transactionId: string | null;
  canConfirm: boolean;
  needsAccount?: boolean;
  requiredCurrency?: string | null;
  compatibleAccounts?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string>(compatibleAccounts[0]?.id ?? "");
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const noCompatibleAccount = needsAccount && compatibleAccounts.length === 0;
  // Block confirm until a same-currency account is chosen when one is required.
  const confirmDisabled = pending || (needsAccount && !selectedAccount);

  return (
    <div className="flex flex-col gap-3">
      {transactionId && canConfirm && needsAccount && (
        <div className="rounded-(--neu-radius-md) border border-accent-yellow/20 bg-accent-yellow-soft p-3">
          {noCompatibleAccount ? (
            <p className="text-sm text-accent-yellow">
              This is a {requiredCurrency} expense, but you have no active {requiredCurrency} account. Create one in
              Money before confirming.
            </p>
          ) : (
            <>
              <label htmlFor="confirm-account" className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Post to {requiredCurrency} account
              </label>
              <select
                id="confirm-account"
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                disabled={pending}
                className="mt-1 w-full rounded-(--neu-radius-sm) border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              >
                {compatibleAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {transactionId && canConfirm && (
          <button
            type="button"
            disabled={confirmDisabled || noCompatibleAccount}
            onClick={() =>
              run(() =>
                confirmDocumentTransactionAction(transactionId, needsAccount ? selectedAccount : undefined),
              )
            }
            className="inline-flex items-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-semibold text-text-inverse shadow-neu-control hover:opacity-90 disabled:opacity-60"
          >
            <CheckIcon size={16} /> Confirm transaction
          </button>
        )}
        {transactionId && canConfirm && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => rejectDocumentTransactionAction(transactionId))}
            className="inline-flex items-center gap-2 rounded-lg border border-danger/30 px-4 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
          >
            <XIcon size={16} /> Reject
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => retryDocumentExtractionAction(documentId))}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-sunken disabled:opacity-60"
        >
          <RefreshCwIcon size={16} /> Retry extraction
        </button>
      </div>
      {pending && <p className="text-xs text-text-muted">Working…</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
