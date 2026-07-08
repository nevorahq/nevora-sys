import { SparklesIcon, AlertTriangleIcon, Loader2Icon, ReceiptTextIcon } from "lucide-react";
import type { DocumentExtractionState } from "../queries/get-document-extraction";
import { ExtractionReviewActions } from "./extraction-review-actions";
import { ExtractionStatusPoller } from "./extraction-status-poller";
import { REVIEW_STATE_LABELS } from "@/modules/review/constants/review.constants";

/**
 * Review surface for Document-to-Transaction. Server component: it renders the
 * extracted data + draft, and delegates Confirm/Reject/Retry to a small client
 * island. No provider internals are exposed to the user.
 */
export function DocumentExtractionReview({
  documentId,
  state,
  canConfirm,
}: {
  documentId: string;
  state: DocumentExtractionState;
  canConfirm: boolean;
}) {
  const { extraction, financialData, items, financialSuggestion, accounts, categories, contexts, classification } = state;

  // Currency picker inputs: a planned draft must post onto a same-currency
  // account. Surface compatible accounts so the user can reassign before confirm.
  const draftCurrency = financialSuggestion?.currency ?? null;
  const compatibleAccounts = accounts
    .filter((a) => a.currency === draftCurrency)
    .map((a) => ({ id: a.id, name: a.name }));
  const needsAccount =
    financialSuggestion?.review_state === "waiting_confirmation";

  if (!extraction) {
    return (
      <section className="soft-card p-5 sm:p-6">
        <Header />
        <p className="mt-3 text-sm text-text-muted">
          This document hasn’t been processed yet.
        </p>
        <div className="mt-4">
          <ExtractionReviewActions documentId={documentId} suggestionId={null} canConfirm={canConfirm} />
        </div>
      </section>
    );
  }

  const status = extraction.status;
  const confidencePct = extraction.confidence_score != null ? Math.round(extraction.confidence_score * 100) : null;

  return (
    <section className="soft-card p-5 sm:p-6">
      <ExtractionStatusPoller status={status} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Header />
        {confidencePct != null && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${confidenceTone(confidencePct)}`}>
            {confidencePct}% confidence
          </span>
        )}
      </div>

      {/* Status / error banner */}
      {(status === "processing" || status === "pending") && (
        <Banner tone="info" icon={<Loader2Icon size={16} className="animate-spin" />}>
          Reading the document and preparing a transaction draft…
        </Banner>
      )}
      {status === "failed" && (
        <Banner tone="danger" icon={<AlertTriangleIcon size={16} />}>
          {friendlyError(extraction.error_code, extraction.error_message)}
        </Banner>
      )}
      {status === "needs_review" && (
        <Banner tone="warning" icon={<AlertTriangleIcon size={16} />}>
          {extraction.error_message ?? extraction.error_code
            ? friendlyError(extraction.error_code, extraction.error_message)
            : "This extraction needs your review before it can become a transaction."}
        </Banner>
      )}

      {/* Extracted fields */}
      {financialData && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Merchant" value={financialData.merchant_name ?? "Unknown merchant"} />
          <Field label="Date" value={financialData.transaction_date ?? "—"} />
          <Field label="Total" value={formatMoney(financialData.total_amount, financialData.currency)} emphasis />
          <Field label="Tax" value={formatMoney(financialData.tax_amount, financialData.currency)} />
          <Field label="Subtotal" value={formatMoney(financialData.subtotal_amount, financialData.currency)} />
          <Field label="Payment method" value={financialData.payment_method ?? "—"} />
        </div>
      )}

      {/* Line items */}
      {items.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-text-secondary">Line items</h3>
          <div className="mt-2 overflow-hidden rounded-(--neu-radius-md) border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-left text-xs text-text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-3 py-2 text-text-primary">{item.name}</td>
                    <td className="px-3 py-2 text-right text-text-secondary">{item.quantity ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-text-secondary">
                      {item.total_price != null ? formatMoney(item.total_price, financialData?.currency ?? null) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Draft financial suggestion */}
      {financialSuggestion && (
        <div className="mt-5 rounded-(--neu-radius-md) bg-surface-sunken p-4">
          <div className="flex items-center gap-2 text-text-secondary">
            <ReceiptTextIcon size={16} />
            <span className="text-sm font-semibold">
              Draft expense suggestion
            </span>
            <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-text-muted">
              {REVIEW_STATE_LABELS[financialSuggestion.review_state]}
            </span>
          </div>
          <p className="mt-2 text-lg font-semibold text-text-primary">
            {formatMoney(financialSuggestion.amount, financialSuggestion.currency)}
            <span className="ml-2 text-sm font-normal text-text-muted">
              · {financialSuggestion.vendor_name ?? "Unknown merchant"}
            </span>
          </p>
          {typeof financialSuggestion.metadata.duplicate_of === "string" && <p className="mt-1 text-xs text-accent-yellow">Possible duplicate of an existing transaction.</p>}
          {financialSuggestion.rejected_reason && <p className="mt-1 text-xs text-danger">{financialSuggestion.rejected_reason}</p>}
          {classification && (
            <div className="mt-3 border-t border-border pt-3 text-xs text-text-muted">
              <p>
                Suggested by <span className="font-medium text-text-secondary">{classification.method.replaceAll("_", " ")}</span>
                {classification.category_confidence != null
                  ? ` · ${Math.round(classification.category_confidence * 100)}% category confidence`
                  : ""}
              </p>
              <p className="mt-1">{classification.reason}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-5">
        <ExtractionReviewActions
          documentId={documentId}
          suggestionId={financialSuggestion?.review_state === "waiting_confirmation" ? financialSuggestion.id : null}
          canConfirm={canConfirm}
          needsAccount={needsAccount}
          requiredCurrency={draftCurrency}
          compatibleAccounts={compatibleAccounts}
          categories={categories}
          contexts={contexts}
          initialCategoryId={financialSuggestion?.category_id ?? null}
          initialContextId={financialSuggestion?.expense_context_id ?? null}
          initialMerchantName={financialSuggestion?.vendor_name ?? financialData?.merchant_name ?? null}
          initialAmount={financialSuggestion?.amount ?? financialData?.total_amount ?? null}
          initialTransactionDate={financialSuggestion?.issue_date ?? financialData?.transaction_date ?? null}
          initialCurrency={financialSuggestion?.currency ?? financialData?.currency ?? null}
        />
      </div>
    </section>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2 text-text-secondary">
      <SparklesIcon size={18} />
      <h2 className="font-semibold">Extracted transaction</h2>
    </div>
  );
}

function Field({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-(--neu-radius-sm) bg-surface-sunken px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-0.5 text-sm ${emphasis ? "font-semibold text-text-primary" : "text-text-secondary"}`}>{value}</p>
    </div>
  );
}

function Banner({ tone, icon, children }: { tone: "info" | "warning" | "danger"; icon: React.ReactNode; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    info: "border-info/20 bg-info-soft text-info",
    warning: "border-accent-yellow/20 bg-accent-yellow-soft text-accent-yellow",
    danger: "border-danger/20 bg-danger-soft text-danger",
  };
  return (
    <div className={`mt-3 flex items-start gap-2 rounded-(--neu-radius-md) border px-3 py-2.5 text-sm ${tones[tone]}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function confidenceTone(pct: number): string {
  if (pct >= 85) return "bg-accent-green-soft text-accent-green";
  if (pct >= 65) return "bg-accent-yellow-soft text-accent-yellow";
  return "bg-danger-soft text-danger";
}

function formatMoney(amount: number | null, currency: string | null): string {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency ?? "EUR" }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ""}`.trim();
  }
}

function friendlyError(code: string | null, message: string | null): string {
  switch (code) {
    case "unsupported_file_type":
      return "This file type can’t be read automatically. Supported: PDF, PNG, JPG, JPEG, WEBP.";
    case "usage_limit_exceeded":
      return message ?? "You’ve reached your extraction limit. Upgrade your plan or wait for the next reset.";
    case "ocr_failed":
    case "pdf_parse_failed":
      return "We couldn’t read this document. Try a clearer scan or a different file.";
    case "ai_normalization_failed":
    case "schema_validation_failed":
      return "We couldn’t confidently understand this document. You can retry or add the transaction manually.";
    default:
      return message ?? "We couldn’t process this document.";
  }
}
