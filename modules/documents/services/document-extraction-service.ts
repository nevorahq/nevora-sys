import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import { createEntityLink } from "@/lib/entity-links";
import { logger } from "@/lib/observability/logger";
import { createDraftTransactionFromDocument } from "@/modules/moneyflow/services/create-draft-transaction-from-document";
import { createActionItemForDocument } from "@/modules/action-center/services/create-action-item-for-document";
import { normalizeFinancialDocument } from "@/modules/ai/services/normalize-financial-document";
import { routeExtraction } from "./document-extraction-router";
import { evaluateExtraction } from "./confidence-rules";
import type { ExtractedFinancialDocument } from "../schemas/extracted-financial-document.schema";
import type { ExtractionErrorCode } from "../types/document-extraction.types";

const STORAGE_BUCKET = "documents";

/**
 * A job stuck in 'pending'/'processing' longer than this is considered dead
 * (crashed worker, lost `after()` callback) and may be reaped so the document
 * is not permanently locked by the one-in-flight unique index (migration 051).
 */
const STALE_JOB_MS = 10 * 60 * 1000;

export type ExtractionRunResult = {
  ok: boolean;
  extractionId: string | null;
  status: "completed" | "needs_review" | "failed" | "skipped";
  transactionId?: string | null;
  errorCode?: ExtractionErrorCode;
  message?: string;
};

export type EnqueueResult =
  | { ok: true; extractionId: string }
  | { ok: false; reason: "already_running" | "no_document" | "no_attachment" | "insert_failed"; message: string };

/**
 * Enqueue an extraction job (status 'pending') for a document and return its id.
 * This claims the per-document in-flight lock synchronously so the UI can show a
 * "processing" state immediately, while the heavy work runs later (via `after()`
 * or a worker) in {@link runDocumentExtraction}.
 *
 * Reaps stale in-flight jobs first so a crashed run can never wedge a document.
 */
export async function enqueueDocumentExtraction(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  documentId: string,
): Promise<EnqueueResult> {
  const { data: document, error: docError } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (docError) logger.error("extraction.enqueue.document_lookup_failed", { documentId, error: docError.message });
  if (!document) return { ok: false, reason: "no_document", message: "Document not found." };

  const { data: attachment } = await supabase
    .from("document_attachments")
    .select("id")
    .eq("document_id", documentId)
    .eq("organization_id", ctx.org.id)
    .limit(1)
    .maybeSingle();
  if (!attachment) return { ok: false, reason: "no_attachment", message: "No file is attached to this document." };

  await reapStaleExtractions(supabase, ctx, documentId);

  const { data: job, error: jobError } = await supabase
    .from("document_extractions")
    .insert({
      organization_id: ctx.org.id,
      workspace_id: ctx.workspace.id,
      document_id: documentId,
      provider: "pdf_parse",
      status: "pending",
      started_at: new Date().toISOString(),
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    if (jobError?.code === "23505") {
      return { ok: false, reason: "already_running", message: "An extraction is already running for this document." };
    }
    logger.error("extraction.enqueue.insert_failed", { documentId, error: jobError?.message });
    return { ok: false, reason: "insert_failed", message: "Could not start extraction." };
  }

  return { ok: true, extractionId: job.id as string };
}

/**
 * Run the full Document-to-Transaction pipeline for an already-enqueued job.
 * Transitions the job pending → processing, then: download → route → meter AI
 * (ai_requests ledger) → normalize → persist → confidence gate → draft + link +
 * action. Every DB write is checked; a failed terminal status update is
 * compensated so a document can never get stuck in 'processing'.
 *
 * Never throws. Designed to run inside Next `after()` or a background worker, so
 * the caller passes a freshly-resolved supabase client + context.
 */
export async function runDocumentExtraction(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  documentId: string,
  extractionId: string,
): Promise<ExtractionRunResult> {
  // Claim the job: pending → processing. If it isn't pending anymore, bail.
  const { data: claimed, error: claimError } = await supabase
    .from("document_extractions")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", extractionId)
    .eq("organization_id", ctx.org.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (claimError) {
    logger.error("extraction.run.claim_failed", { documentId, extractionId, error: claimError.message });
    return { ok: false, extractionId, status: "failed", errorCode: "unknown_error", message: "Could not start extraction." };
  }
  if (!claimed) {
    return { ok: false, extractionId, status: "skipped", message: "Extraction is already running or finished." };
  }

  const { data: document, error: docError } = await supabase
    .from("documents")
    .select("id, title, doc_type")
    .eq("id", documentId)
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (docError || !document) {
    return fail(supabase, ctx, { documentId, extractionId, code: "no_attachment", message: "Document not found." });
  }

  const { data: attachment } = await supabase
    .from("document_attachments")
    .select("id, file_path, extension, mime_type, client_mime_type")
    .eq("document_id", documentId)
    .eq("organization_id", ctx.org.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!attachment?.file_path) {
    return fail(supabase, ctx, { documentId, extractionId, code: "no_attachment", message: "No file is attached to this document." });
  }

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "document.extraction.started",
    aggregateType: "document",
    aggregateId: documentId,
    payload: { extraction_id: extractionId, provider: "pdf_parse", doc_type: document.doc_type as string },
  });

  // Download the file from private storage (RLS-scoped client).
  const { data: blob, error: downloadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(attachment.file_path as string);
  if (downloadError || !blob) {
    return fail(supabase, ctx, { documentId, extractionId, code: "storage_download_failed", message: "The file could not be retrieved from storage." });
  }
  const buffer = Buffer.from(await blob.arrayBuffer());

  // Route to the cheapest viable extractor.
  const route = await routeExtraction({
    buffer,
    mimeType: (attachment.mime_type ?? attachment.client_mime_type) as string | null,
    extension: attachment.extension as string | null,
  });
  if (!route.ok) {
    return fail(supabase, ctx, { documentId, extractionId, code: route.errorCode, message: route.errorMessage });
  }

  // Meter AI usage by recording a request in the ai_requests ledger. The
  // start_limit_ai_requests trigger (migration 033) rejects the insert when the
  // monthly ai_calls quota is exhausted — that rejection IS the limit.
  const { data: aiRequest, error: aiRequestError } = await supabase
    .from("ai_requests")
    .insert({ organization_id: ctx.org.id, user_id: ctx.user.id, action_type: "document_extraction" })
    .select("id")
    .single();
  if (aiRequestError || !aiRequest) {
    return fail(supabase, ctx, {
      documentId,
      extractionId,
      code: "usage_limit_exceeded",
      message: "AI usage limit reached. Upgrade your plan to extract more documents.",
      provider: route.provider,
      rawText: route.rawText,
    });
  }
  const aiRequestId = aiRequest.id as string;

  // Normalize to the strict schema.
  const normalized = await normalizeFinancialDocument(route.normalization);
  if (!normalized.ok) {
    await markAiRequest(supabase, aiRequestId, "failed");
    return fail(supabase, ctx, {
      documentId,
      extractionId,
      code: normalized.errorCode,
      message: normalized.errorMessage,
      provider: route.provider,
      rawText: route.rawText,
    });
  }
  await markAiRequest(supabase, aiRequestId, "completed");

  const extracted = normalized.extracted;

  // Persist normalized header + line items. A header failure is fatal: never
  // mark the run completed on top of unsaved financial data.
  const persisted = await persistFinancialData(supabase, ctx, { documentId, extractionId, extracted });
  if (!persisted.ok) {
    return fail(supabase, ctx, {
      documentId,
      extractionId,
      code: "unknown_error",
      message: persisted.message,
      provider: route.provider,
      rawText: route.rawText,
    });
  }

  // Confidence gate + terminal status update (compensated on failure). If line
  // items couldn't be saved, force a human review even for a high-confidence doc.
  const decision = evaluateExtraction(extracted);
  const extractionStatus = persisted.itemsComplete ? decision.extractionStatus : "needs_review";
  const { error: statusError } = await supabase
    .from("document_extractions")
    .update({
      provider: route.provider,
      status: extractionStatus,
      raw_text: route.rawText,
      raw_json: normalized.raw as Record<string, unknown>,
      normalized_json: extracted as unknown as Record<string, unknown>,
      confidence_score: extracted.confidence.overall,
      completed_at: new Date().toISOString(),
    })
    .eq("id", extractionId)
    .eq("organization_id", ctx.org.id);
  if (statusError) {
    // A stuck 'processing' row would block all future retries via the in-flight
    // index — compensate by forcing the job to a terminal state.
    logger.error("extraction.run.terminal_status_failed", { documentId, extractionId, error: statusError.message });
    return fail(supabase, ctx, {
      documentId,
      extractionId,
      code: "unknown_error",
      message: "Extraction completed but its result could not be saved. Please retry.",
      provider: route.provider,
      rawText: route.rawText,
    });
  }

  let transactionId: string | null = null;

  if (decision.createTransaction) {
    const draft = await createDraftTransactionFromDocument(supabase, ctx, {
      documentId,
      extractionId,
      merchantName: extracted.merchant.name,
      totalAmount: extracted.transaction.total as number,
      currency: extracted.transaction.currency,
      transactionDate: normalizeDate(extracted.transaction.date),
      categoryId: null,
      confidence: extracted.confidence.overall,
    });

    if (draft.ok) {
      transactionId = draft.transactionId;

      // Link document → transaction (auto, with confidence metadata).
      const link = await createEntityLink({
        sourceType: "document",
        sourceId: documentId,
        targetType: "transaction",
        targetId: draft.transactionId,
        linkType: "invoice_for_transaction",
        relationDirection: "direct",
        metadata: { source: "auto", confidence: extracted.confidence.overall, matched_by: ["document_extraction"] },
      });
      if (!link.ok) logger.error("extraction.run.link_failed", { documentId, extractionId, error: link.error });

      // Action Center: confirm the drafted expense.
      const amountLabel = formatAmount(extracted.transaction.total as number, extracted.transaction.currency);
      const merchant = extracted.merchant.name?.trim() || "Unknown merchant";
      await createActionItemForDocument(supabase, ctx, {
        type: "draft_review",
        title: `Confirm expense from ${merchant} — ${amountLabel}`,
        description: draft.duplicateOfId
          ? `Business OS extracted a possible expense from your document, but it may duplicate an existing transaction. Review before confirming.`
          : `Business OS extracted a possible expense from the uploaded document. Review and confirm it before adding it to Money.`,
        sourceType: "transaction",
        sourceId: draft.transactionId,
        primaryEntityType: "transaction",
        primaryEntityId: draft.transactionId,
        financialImpact: extracted.transaction.total as number,
        aiConfidence: extracted.confidence.overall,
        aiReason: decision.reason,
        metadata: { source_document_id: documentId, extraction_id: extractionId, duplicate_of: draft.duplicateOfId, needs_field_review: decision.requiresFieldReview },
      });
    } else {
      // Draft couldn't be created (e.g. no account) → ask the user to act.
      await openDocumentReview(supabase, ctx, { documentId, title: document.title as string, reason: draft.errorMessage, confidence: extracted.confidence.overall });
    }
  } else {
    await openDocumentReview(supabase, ctx, { documentId, title: document.title as string, reason: decision.reason, confidence: extracted.confidence.overall });
  }

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "document.extraction.completed",
    aggregateType: "document",
    aggregateId: documentId,
    payload: {
      extraction_id: extractionId,
      provider: route.provider,
      confidence: extracted.confidence.overall,
      created_transaction: transactionId != null,
      transaction_id: transactionId,
    },
  });

  logger.info("extraction.run.done", {
    documentId,
    extractionId,
    status: extractionStatus,
    provider: route.provider,
    transactionId: transactionId ?? null,
  });
  return { ok: true, extractionId, status: extractionStatus, transactionId };
}

/**
 * Convenience: enqueue + run in one call (used by the retry action and any
 * synchronous path). Returns the run result, or a skipped/failed result if the
 * job could not be enqueued.
 */
export async function enqueueAndRunDocumentExtraction(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  documentId: string,
): Promise<ExtractionRunResult> {
  const enqueued = await enqueueDocumentExtraction(supabase, ctx, documentId);
  if (!enqueued.ok) {
    const status = enqueued.reason === "already_running" ? "skipped" : "failed";
    return { ok: false, extractionId: null, status, message: enqueued.message };
  }
  return runDocumentExtraction(supabase, ctx, documentId, enqueued.extractionId);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Force jobs that have been in-flight too long to a terminal 'failed' state. */
async function reapStaleExtractions(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  documentId: string,
): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_JOB_MS).toISOString();
  const { error } = await supabase
    .from("document_extractions")
    .update({
      status: "failed",
      error_code: "unknown_error",
      error_message: "Extraction timed out and was reset.",
      completed_at: new Date().toISOString(),
    })
    .eq("organization_id", ctx.org.id)
    .eq("document_id", documentId)
    .in("status", ["pending", "processing"])
    .lt("started_at", cutoff);
  if (error) logger.error("extraction.reap.failed", { documentId, error: error.message });
}

async function markAiRequest(
  supabase: SupabaseClient,
  aiRequestId: string,
  status: "completed" | "failed",
): Promise<void> {
  const { error } = await supabase
    .from("ai_requests")
    .update({ status, completed_at: new Date().toISOString() })
    .eq("id", aiRequestId);
  if (error) logger.error("extraction.ai_request.update_failed", { aiRequestId, status, error: error.message });
}

/**
 * Persist the normalized header + line items.
 *
 * The header row (`financial_document_data`) is what the extraction-review UI
 * reads, so a header failure is FATAL — the caller must fail the run instead of
 * marking it `completed`. Line-item failures are non-fatal but downgrade the run
 * to `needs_review` so a human verifies the (now incomplete) breakdown.
 */
type PersistResult =
  | { ok: false; message: string }
  | { ok: true; itemsComplete: boolean };

async function persistFinancialData(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  params: { documentId: string; extractionId: string; extracted: ExtractedFinancialDocument },
): Promise<PersistResult> {
  const { extracted } = params;

  const { error: upsertError } = await supabase.from("financial_document_data").upsert(
    {
      organization_id: ctx.org.id,
      workspace_id: ctx.workspace.id,
      document_id: params.documentId,
      extraction_id: params.extractionId,
      document_type: extracted.documentType,
      merchant_name: extracted.merchant.name,
      merchant_tax_id: extracted.merchant.taxId,
      document_number: extracted.transaction.documentNumber ?? null,
      transaction_date: normalizeDate(extracted.transaction.date),
      currency: extracted.transaction.currency,
      subtotal_amount: extracted.transaction.subtotal,
      tax_amount: extracted.transaction.tax,
      total_amount: extracted.transaction.total,
      payment_method: extracted.transaction.paymentMethod,
      suggested_category_id: null,
      confidence_score: extracted.confidence.overall,
    },
    { onConflict: "document_id" },
  );
  if (upsertError) {
    logger.error("extraction.persist.header_failed", { documentId: params.documentId, extractionId: params.extractionId, error: upsertError.message });
    return { ok: false, message: "Extraction succeeded but its data could not be saved. Please retry." };
  }

  let itemsComplete = true;

  // Replace line items for this document.
  const { error: deleteError } = await supabase
    .from("financial_document_items")
    .delete()
    .eq("document_id", params.documentId)
    .eq("organization_id", ctx.org.id);
  if (deleteError) {
    logger.error("extraction.persist.items_delete_failed", { documentId: params.documentId, extractionId: params.extractionId, error: deleteError.message });
    itemsComplete = false;
  }

  if (extracted.items.length > 0) {
    const { error: insertError } = await supabase.from("financial_document_items").insert(
      extracted.items.slice(0, 200).map((item) => ({
        organization_id: ctx.org.id,
        workspace_id: ctx.workspace.id,
        document_id: params.documentId,
        extraction_id: params.extractionId,
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
        tax_rate: item.taxRate,
        suggested_category_id: null,
      })),
    );
    if (insertError) {
      logger.error("extraction.persist.items_insert_failed", { documentId: params.documentId, extractionId: params.extractionId, error: insertError.message });
      itemsComplete = false;
    }
  }

  return { ok: true, itemsComplete };
}

async function openDocumentReview(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  params: { documentId: string; title: string; reason: string; confidence: number },
): Promise<void> {
  await createActionItemForDocument(supabase, ctx, {
    type: "document_review",
    title: `Review document extraction: ${params.title}`,
    description: params.reason,
    sourceType: "document",
    sourceId: params.documentId,
    primaryEntityType: "document",
    primaryEntityId: params.documentId,
    aiConfidence: params.confidence,
    aiReason: params.reason,
    metadata: { source_document_id: params.documentId },
  });
}

async function fail(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  params: {
    documentId: string;
    extractionId: string;
    code: ExtractionErrorCode;
    message: string;
    provider?: string;
    rawText?: string | null;
  },
): Promise<ExtractionRunResult> {
  const status = params.code === "usage_limit_exceeded" ? "needs_review" : "failed";
  const { error: updateError } = await supabase
    .from("document_extractions")
    .update({
      status,
      provider: params.provider ?? undefined,
      raw_text: params.rawText ?? null,
      error_code: params.code,
      error_message: params.message,
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.extractionId)
    .eq("organization_id", ctx.org.id);
  if (updateError) {
    // Last-ditch: clear the in-flight lock so the document can be retried.
    logger.error("extraction.fail.status_update_failed", { documentId: params.documentId, extractionId: params.extractionId, error: updateError.message });
    await supabase
      .from("document_extractions")
      .update({ status: "failed", error_code: params.code, completed_at: new Date().toISOString() })
      .eq("id", params.extractionId)
      .eq("organization_id", ctx.org.id);
  }

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "document.extraction.failed",
    aggregateType: "document",
    aggregateId: params.documentId,
    payload: { extraction_id: params.extractionId, error_code: params.code, error_message: params.message },
  });

  // Surface to the user via Action Center (best-effort).
  await createActionItemForDocument(supabase, ctx, {
    type: "document_review",
    title: "Review document extraction",
    description: params.message,
    sourceType: "document",
    sourceId: params.documentId,
    primaryEntityType: "document",
    primaryEntityId: params.documentId,
    metadata: { source_document_id: params.documentId, error_code: params.code },
  }).catch(() => undefined);

  return { ok: false, extractionId: params.extractionId, status, errorCode: params.code, message: params.message };
}

/** Coerce a model date string to YYYY-MM-DD or null. */
function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
