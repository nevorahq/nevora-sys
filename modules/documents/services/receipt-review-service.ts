import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitAuditLog } from "@/lib/events";
import { confirmFinancialSuggestionRecord } from "@/modules/review/services/financial-suggestion.service";
import { getDocumentExtractionState } from "../queries/get-document-extraction";
import type { CodeMismatchField } from "../utils/parse-receipt-code";
import type { SaveReviewedReceiptInput } from "../schemas/receipt-review.schema";

/**
 * Receipt review: the data behind the Inbox preview modal, and the one call that
 * saves the user's corrections and posts the expense.
 *
 * Money safety is unchanged: posting goes through the existing
 * `confirmFinancialSuggestionRecord` (account/currency/category guards, usage
 * reservation, the document → transaction link). This service only adds the
 * correction of the Document's own extracted data — its header and line items —
 * which never touches money on its own.
 */

export type ReceiptReviewStatus =
  /** Extraction has not finished yet — keep polling. */
  | "processing"
  /** Extraction failed (unreadable file, AI limit, …). */
  | "failed"
  /** Read, but no expense draft came out (a note, a low-confidence read). */
  | "no_draft"
  /** An expense draft awaits the user's review. */
  | "ready"
  /** Already posted. */
  | "confirmed";

export interface ReceiptReviewItem {
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
}

export interface ReceiptReview {
  status: ReceiptReviewStatus;
  documentId: string;
  errorCode: string | null;
  /** Short-lived signed URL of the captured image, when it is an image. */
  photoUrl: string | null;
  suggestionId: string | null;
  transactionId: string | null;
  merchantName: string | null;
  merchantTaxId: string | null;
  transactionDate: string | null;
  currency: string | null;
  total: number | null;
  items: ReceiptReviewItem[];
  categoryId: string | null;
  expenseContextId: string | null;
  possibleDuplicate: boolean;
  /** Header fields where the model disagreed with a scanned code. */
  codeMismatches: CodeMismatchField[];
  /** Whether the capture carried a scanned code at all. */
  scanned: boolean;
  accounts: { id: string; name: string; currency: string }[];
  categories: { id: string; name: string }[];
  contexts: { id: string; name: string; visibility: "organization" | "private" }[];
}

const PHOTO_URL_TTL_SECONDS = 10 * 60;
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export async function getReceiptReview(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  documentId: string,
): Promise<ReceiptReview | null> {
  const { data: document } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!document) return null;

  const [state, photoUrl] = await Promise.all([
    getDocumentExtractionState(ctx.org.id, documentId),
    signedPhotoUrl(supabase, ctx, documentId),
  ]);
  const { extraction, financialData, financialSuggestion: suggestion } = state;
  const metadata = suggestion?.metadata ?? {};

  return {
    status: reviewStatus(state),
    documentId,
    errorCode: extraction?.status === "failed" || extraction?.status === "needs_review" ? extraction.error_code : null,
    photoUrl,
    suggestionId: suggestion?.id ?? null,
    transactionId: suggestion?.created_transaction_id ?? null,
    merchantName: suggestion?.vendor_name ?? financialData?.merchant_name ?? null,
    merchantTaxId: financialData?.merchant_tax_id ?? null,
    transactionDate: suggestion?.issue_date ?? financialData?.transaction_date ?? null,
    currency: suggestion?.currency ?? financialData?.currency ?? null,
    total: suggestion?.amount ?? (financialData?.total_amount == null ? null : Number(financialData.total_amount)),
    items: state.items.map((item) => ({
      name: item.name,
      quantity: numberOrNull(item.quantity),
      unitPrice: numberOrNull(item.unit_price),
      totalPrice: numberOrNull(item.total_price),
    })),
    categoryId: suggestion?.category_id ?? null,
    expenseContextId: suggestion?.expense_context_id ?? null,
    possibleDuplicate: typeof metadata.duplicate_of === "string",
    codeMismatches: Array.isArray(metadata.code_mismatches)
      ? (metadata.code_mismatches as unknown[]).filter(isMismatchField)
      : [],
    scanned: typeof metadata.capture_code_kind === "string",
    accounts: state.accounts,
    categories: state.categories,
    contexts: state.contexts.map(({ id, name, visibility }) => ({ id, name, visibility })),
  };
}

export type SaveReviewedReceiptResult =
  | { ok: true; transactionId: string; alreadyConfirmed: boolean }
  | { ok: false; code: "not_found" | "handled" | "currency_mismatch" | "failed"; error: string };

export async function saveReviewedReceipt(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: SaveReviewedReceiptInput,
): Promise<SaveReviewedReceiptResult> {
  const { data: suggestion } = await supabase
    .from("financial_suggestions")
    .select("id, source_id, review_state, created_transaction_id, metadata")
    .eq("id", input.suggestionId)
    .eq("organization_id", ctx.org.id)
    .eq("source_type", "document")
    .eq("source_id", input.documentId)
    .eq("suggestion_type", "create_expense")
    .maybeSingle();
  if (!suggestion) return { ok: false, code: "not_found", error: "Suggestion not found" };

  if (suggestion.review_state === "confirmed" && suggestion.created_transaction_id) {
    return { ok: true, transactionId: suggestion.created_transaction_id as string, alreadyConfirmed: true };
  }
  if (suggestion.review_state !== "suggested" && suggestion.review_state !== "waiting_confirmation") {
    return { ok: false, code: "handled", error: "This suggestion has already been handled" };
  }

  // 1. The Document's own data first, so a confirm that fails (say, no account
  //    in that currency) still keeps the corrections for the next attempt.
  const corrected = await saveDocumentCorrections(supabase, ctx, input, extractionIdOf(suggestion.metadata));
  if (!corrected.ok) return { ok: false, code: "failed", error: corrected.error };

  // 2. Post through the existing money-safe confirm.
  const confirmed = await confirmFinancialSuggestionRecord(supabase, ctx, {
    suggestionId: input.suggestionId,
    accountId: input.accountId,
    categoryId: input.categoryId,
    expenseContextId: input.expenseContextId,
    vendorName: input.vendorName,
    amount: input.amount,
    transactionDate: input.transactionDate,
    currency: input.currency,
    rememberChoice: input.rememberChoice,
  });
  if (!confirmed.ok) {
    return {
      ok: false,
      code: confirmed.code === "currency_mismatch" ? "currency_mismatch" : "failed",
      error: confirmed.error,
    };
  }
  return { ok: true, transactionId: confirmed.data.transactionId, alreadyConfirmed: confirmed.data.alreadyConfirmed };
}

async function saveDocumentCorrections(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: SaveReviewedReceiptInput,
  extractionId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: headerError } = await supabase
    .from("financial_document_data")
    .update({
      merchant_name: input.vendorName,
      merchant_tax_id: input.merchantTaxId,
      transaction_date: input.transactionDate,
      currency: input.currency,
      total_amount: input.amount,
    })
    .eq("organization_id", ctx.org.id)
    .eq("document_id", input.documentId);
  if (headerError) return { ok: false, error: "The corrected receipt could not be saved" };

  // Items are replaced as a set (the table has no UPDATE policy by design).
  const { error: deleteError } = await supabase
    .from("financial_document_items")
    .delete()
    .eq("organization_id", ctx.org.id)
    .eq("document_id", input.documentId);
  if (deleteError) return { ok: false, error: "The corrected items could not be saved" };

  if (input.items.length > 0) {
    const { error: insertError } = await supabase.from("financial_document_items").insert(
      input.items.map((item) => ({
        organization_id: ctx.org.id,
        workspace_id: ctx.workspace.id,
        document_id: input.documentId,
        extraction_id: extractionId,
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
        tax_rate: null,
        suggested_category_id: null,
      })),
    );
    if (insertError) return { ok: false, error: "The corrected items could not be saved" };
  }

  await emitAuditLog({
    organizationId: ctx.org.id,
    entityType: "documents",
    entityId: input.documentId,
    action: "update",
    newData: {
      extraction: "corrected",
      merchant_name: input.vendorName,
      transaction_date: input.transactionDate,
      currency: input.currency,
      total_amount: input.amount,
      item_count: input.items.length,
    },
    metadata: { source: "dashboard", origin: "receipt_review" },
  });
  return { ok: true };
}

function reviewStatus(state: Awaited<ReturnType<typeof getDocumentExtractionState>>): ReceiptReviewStatus {
  const suggestion = state.financialSuggestion;
  if (suggestion?.review_state === "confirmed") return "confirmed";
  if (suggestion && (suggestion.review_state === "suggested" || suggestion.review_state === "waiting_confirmation")) {
    return "ready";
  }
  const status = state.extraction?.status;
  if (!status || status === "pending" || status === "processing") return "processing";
  if (status === "failed") return "failed";
  return "no_draft";
}

async function signedPhotoUrl(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  documentId: string,
): Promise<string | null> {
  const { data: attachment } = await supabase
    .from("document_attachments")
    .select("file_path, extension")
    .eq("document_id", documentId)
    .eq("organization_id", ctx.org.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const extension = ((attachment?.extension as string | null) ?? "").toLowerCase();
  if (!attachment?.file_path || !IMAGE_EXTENSIONS.has(extension)) return null;
  const { data } = await supabase.storage
    .from("documents")
    .createSignedUrl(attachment.file_path as string, PHOTO_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

function extractionIdOf(metadata: unknown): string | null {
  const value = (metadata as Record<string, unknown> | null)?.extraction_id;
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: number | string | null): number | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isMismatchField(value: unknown): value is CodeMismatchField {
  return value === "amount" || value === "currency" || value === "date";
}
