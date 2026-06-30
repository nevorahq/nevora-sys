import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { DEFAULT_CURRENCY } from "../constants/moneyflow.constants";
import { findDuplicateTransaction } from "@/modules/documents/services/duplicate-detection";

/**
 * Create a DRAFT money transaction from extracted financial data.
 *
 * "Draft" == status 'planned' (migration 041): excluded from balance/expenses
 * until the user confirms (planned → posted). We never create a 'posted'
 * (confirmed) transaction here — confirmation is an explicit user action.
 *
 * Security: org/workspace/created_by come from the server context, never the
 * document payload. account_id is resolved server-side (default org account)
 * and re-checked by RLS on insert.
 */

export interface DraftTransactionInput {
  documentId: string;
  extractionId: string;
  merchantName: string | null;
  totalAmount: number;
  currency: string;
  transactionDate: string | null; // ISO date or null → today fallback
  categoryId: string | null;
  expenseContextId?: string | null;
  visibility?: "organization" | "private";
  ownerUserId?: string | null;
  confidence: number;
}

export type DraftTransactionResult =
  | { ok: true; transactionId: string; duplicateOfId: string | null }
  | { ok: false; errorCode: "no_account" | "transaction_creation_failed"; errorMessage: string }
  | { ok: false; errorCode: "already_confirmed"; existingTransactionId: string; errorMessage: string };

export async function createDraftTransactionFromDocument(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: DraftTransactionInput,
): Promise<DraftTransactionResult> {
  // 0. Idempotency guard: if this document already produced a CONFIRMED (posted)
  // transaction, a re-extraction (e.g. "Retry extraction") must not mint a second
  // draft. Confirming that draft would post a duplicate expense into the ledger.
  // Planned drafts are intentionally NOT blocked here — they are superseded below.
  const { data: confirmedExisting } = await supabase
    .from("money_transactions")
    .select("id")
    .eq("organization_id", ctx.org.id)
    .eq("source_document_id", input.documentId)
    .eq("status", "posted")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (confirmedExisting) {
    return {
      ok: false,
      errorCode: "already_confirmed",
      existingTransactionId: confirmedExisting.id as string,
      errorMessage: "This document is already linked to a confirmed transaction.",
    };
  }

  // 1. Resolve a default account — a transaction cannot exist without one.
  const { data: account } = await supabase
    .from("money_accounts")
    .select("id")
    .eq("organization_id", ctx.org.id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!account) {
    return {
      ok: false,
      errorCode: "no_account",
      errorMessage: "Add a money account before importing expenses from documents.",
    };
  }

  // 2. Duplicate detection (warning, not a hard block).
  const transactionDate = input.transactionDate ?? new Date().toISOString().slice(0, 10);
  const duplicate = await findDuplicateTransaction(supabase, {
    organizationId: ctx.org.id,
    merchantName: input.merchantName,
    totalAmount: input.totalAmount,
    currency: input.currency,
    transactionDate,
    excludeDocumentId: input.documentId,
  });

  const title = input.merchantName?.trim() || "Unknown merchant";

  // 3. Insert the DRAFT (planned) transaction. Whitelisted columns only.
  const { data: tx, error } = await supabase
    .from("money_transactions")
    .insert({
      organization_id: ctx.org.id,
      workspace_id: ctx.workspace.id,
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
      account_id: account.id,
      category_id: input.categoryId,
      expense_context_id: input.expenseContextId ?? null,
      visibility: input.visibility ?? "organization",
      owner_user_id: input.visibility === "private" ? (input.ownerUserId ?? ctx.user.id) : null,
      type: "expense",
      amount: input.totalAmount,
      currency: input.currency || DEFAULT_CURRENCY,
      transaction_date: transactionDate,
      title,
      status: "planned",
      source_document_id: input.documentId,
      source_extraction_id: input.extractionId,
      merchant_name: input.merchantName,
      confidence_score: input.confidence,
      note: duplicate.isDuplicate
        ? "Possible duplicate of an existing transaction — please review."
        : null,
    })
    .select("id")
    .single();

  if (error || !tx) {
    console.error("[createDraftTransactionFromDocument] insert failed:", error?.message);
    return {
      ok: false,
      errorCode: "transaction_creation_failed",
      errorMessage: "The draft transaction could not be created.",
    };
  }

  // 3b. Supersede prior UNCONFIRMED (planned) drafts from the SAME document —
  // AFTER the new draft is safely inserted, so a failed insert never destroys a
  // working previous draft. The new row excludes itself via .neq. Confirmed
  // (posted) transactions are never touched. Their review items are dismissed so
  // the Action Center doesn't point at soft-deleted drafts.
  const { data: superseded, error: supersedeError } = await supabase
    .from("money_transactions")
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.user.id })
    .eq("organization_id", ctx.org.id)
    .eq("source_document_id", input.documentId)
    .eq("status", "planned")
    .is("deleted_at", null)
    .neq("id", tx.id)
    .select("id");
  if (supersedeError) console.error("[createDraftTransactionFromDocument] supersede prior drafts failed:", supersedeError.message);

  if (superseded?.length) {
    const supersededIds = superseded.map((r) => r.id as string);
    const { error: dismissError } = await supabase
      .from("action_items")
      .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
      .eq("organization_id", ctx.org.id)
      .eq("source_type", "transaction")
      .in("source_id", supersededIds)
      .in("status", ["open", "in_progress", "snoozed"]);
    if (dismissError) console.error("[createDraftTransactionFromDocument] dismiss stale items failed:", dismissError.message);
  }

  // 4. Events + audit (failures here never roll back the draft).
  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "money.transaction.draft_created",
      aggregateType: "transaction",
      aggregateId: tx.id,
      payload: {
        amount: input.totalAmount,
        currency: input.currency || DEFAULT_CURRENCY,
        type: "expense",
        merchant_name: input.merchantName,
        source_document_id: input.documentId,
        confidence: input.confidence,
      },
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "money_transactions",
      entityId: tx.id,
      action: "create",
      newData: {
        amount: input.totalAmount,
        currency: input.currency,
        merchant_name: input.merchantName,
        source_document_id: input.documentId,
        status: "planned",
      },
      metadata: { source: "automation" },
    }),
  ]);

  return { ok: true, transactionId: tx.id as string, duplicateOfId: duplicate.matchedTransactionId };
}
