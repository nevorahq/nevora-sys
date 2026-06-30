"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { confirmDocumentTransactionAction } from "@/modules/moneyflow/actions/confirm-document-transaction.action";
import { rejectDocumentTransactionAction } from "@/modules/moneyflow/actions/reject-document-transaction.action";
import { retryDocumentExtractionAction } from "../actions/retry-document-extraction.action";
import { CreateAccountInlineCTA } from "./create-account-inline-cta";
import type { MoneyAccountOption } from "@/modules/moneyflow/services/money-account-service";
import { Toast } from "@/shared/ui/toast";

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
  categories = [],
  contexts = [],
  initialCategoryId = null,
  initialContextId = null,
  initialMerchantName = "Unknown merchant",
  initialAmount = null,
  initialTransactionDate = null,
  initialCurrency = null,
}: {
  documentId: string;
  transactionId: string | null;
  canConfirm: boolean;
  needsAccount?: boolean;
  requiredCurrency?: string | null;
  compatibleAccounts?: { id: string; name: string }[];
  categories?: { id: string; name: string }[];
  contexts?: { id: string; name: string; slug: string; visibility: "organization" | "private" }[];
  initialCategoryId?: string | null;
  initialContextId?: string | null;
  initialMerchantName?: string | null;
  initialAmount?: number | null;
  initialTransactionDate?: string | null;
  initialCurrency?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [addedAccounts, setAddedAccounts] = useState<{ id: string; name: string }[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>(compatibleAccounts[0]?.id ?? "");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(initialCategoryId ?? categories[0]?.id ?? "");
  const [selectedContext, setSelectedContext] = useState(initialContextId ?? contexts[0]?.id ?? "");
  const [rememberChoice, setRememberChoice] = useState(false);
  const [merchantName, setMerchantName] = useState(initialMerchantName?.trim() || "Unknown merchant");
  const [amount, setAmount] = useState(initialAmount?.toString() ?? "");
  const [transactionDate, setTransactionDate] = useState(initialTransactionDate ?? new Date().toISOString().slice(0, 10));
  const [pending, start] = useTransition();

  const availableAccounts = useMemo(() => {
    const merged = new Map(compatibleAccounts.map((account) => [account.id, account]));
    for (const account of addedAccounts) merged.set(account.id, account);
    return [...merged.values()];
  }, [addedAccounts, compatibleAccounts]);
  const effectiveSelectedAccount = selectedAccount || availableAccounts[0]?.id || "";

  const handleAccountReady = useCallback((account: MoneyAccountOption, created: boolean) => {
    setAddedAccounts((current) =>
      current.some((candidate) => candidate.id === account.id)
        ? current
        : [...current, { id: account.id, name: account.name }],
    );
    setSelectedAccount(account.id);
    setToastMessage(
      created
        ? `${account.currency} account created successfully.`
        : `${account.currency} account is ready.`,
    );
  }, []);

  const dismissToast = useCallback(() => setToastMessage(null), []);

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

  const noCompatibleAccount = needsAccount && availableAccounts.length === 0;
  // Block confirm until a same-currency account is chosen when one is required.
  const confirmDisabled = pending || (needsAccount && !effectiveSelectedAccount);
  const canReviewClassification = categories.length > 0 && contexts.length > 0;

  function confirmTransaction() {
    const targetAccount = needsAccount ? effectiveSelectedAccount : undefined;
    if (canReviewClassification && selectedCategory && selectedContext) {
      return confirmDocumentTransactionAction(transactionId as string, targetAccount, {
        categoryId: selectedCategory,
        expenseContextId: selectedContext,
        rememberChoice,
        merchantName,
        amount: Number(amount),
        transactionDate,
        currency: initialCurrency ?? requiredCurrency ?? "EUR",
      });
    }
    return confirmDocumentTransactionAction(transactionId as string, targetAccount);
  }

  return (
    <div className="flex flex-col gap-3">
      {transactionId && canConfirm && needsAccount && (
        <div className="rounded-(--neu-radius-md) border border-accent-yellow/20 bg-accent-yellow-soft p-3">
          {noCompatibleAccount ? (
            transactionId && requiredCurrency ? (
              <CreateAccountInlineCTA
                transactionId={transactionId}
                currency={requiredCurrency}
                onAccountReady={handleAccountReady}
              />
            ) : null
          ) : (
            <>
              <label htmlFor="confirm-account" className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Post to {requiredCurrency} account
              </label>
              <select
                id="confirm-account"
                value={effectiveSelectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                disabled={pending}
                className="mt-1 w-full rounded-(--neu-radius-sm) border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              >
                {availableAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      )}

      {transactionId && canConfirm && canReviewClassification && (
        <div className="grid gap-3 rounded-(--neu-radius-md) border border-border bg-surface-sunken p-3 sm:grid-cols-2">
          <div>
            <label htmlFor="confirm-merchant" className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Merchant
            </label>
            <input
              id="confirm-merchant"
              value={merchantName}
              onChange={(event) => setMerchantName(event.target.value)}
              required
              maxLength={240}
              disabled={pending}
              className="mt-1 w-full rounded-(--neu-radius-sm) border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            />
          </div>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <div>
              <label htmlFor="confirm-amount" className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Amount
              </label>
              <input
                id="confirm-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                disabled={pending}
                className="mt-1 w-full rounded-(--neu-radius-sm) border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              />
            </div>
            <div>
              <label htmlFor="confirm-currency" className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Currency
              </label>
              <input
                id="confirm-currency"
                value={initialCurrency ?? requiredCurrency ?? "EUR"}
                readOnly
                className="mt-1 w-full rounded-(--neu-radius-sm) border border-border bg-surface-sunken px-2 py-2 text-sm text-text-muted"
              />
            </div>
          </div>
          <div>
            <label htmlFor="confirm-date" className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Date
            </label>
            <input
              id="confirm-date"
              type="date"
              value={transactionDate}
              onChange={(event) => setTransactionDate(event.target.value)}
              required
              disabled={pending}
              className="mt-1 w-full rounded-(--neu-radius-sm) border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            />
          </div>
          <div />
          <div>
            <label htmlFor="confirm-category" className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Category
            </label>
            <select
              id="confirm-category"
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              disabled={pending}
              className="mt-1 w-full rounded-(--neu-radius-sm) border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            >
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="confirm-context" className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Expense context
            </label>
            <select
              id="confirm-context"
              value={selectedContext}
              onChange={(event) => setSelectedContext(event.target.value)}
              disabled={pending}
              className="mt-1 w-full rounded-(--neu-radius-sm) border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            >
              {contexts.map((context) => (
                <option key={context.id} value={context.id}>
                  {context.name}{context.visibility === "private" ? " · private" : ""}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-text-secondary sm:col-span-2">
            <input
              type="checkbox"
              checked={rememberChoice}
              onChange={(event) => setRememberChoice(event.target.checked)}
              disabled={pending}
              className="h-4 w-4 rounded border-border"
            />
            Remember this choice for similar expenses from this merchant
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {transactionId && canConfirm && (
          <button
            type="button"
            disabled={confirmDisabled || noCompatibleAccount || (canReviewClassification && (!merchantName.trim() || Number(amount) <= 0 || !transactionDate))}
            onClick={() => run(confirmTransaction)}
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
      <Toast message={toastMessage} onDismiss={dismissToast} />
    </div>
  );
}
