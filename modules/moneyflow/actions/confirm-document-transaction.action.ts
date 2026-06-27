"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";

export type ConfirmDocumentTransactionResult = {
  error?: string;
  /** Set when the draft currency does not match the target account's currency. */
  code?: "currency_mismatch";
  /** The currency the user must pick a compatible account for. */
  requiredCurrency?: string;
};

/**
 * Confirm a draft (planned) transaction created from a document.
 *
 * "Confirm" == planned → posted (migration 041): the transaction now counts in
 * Balance / Monthly Expenses. This is the ONLY path that posts a
 * document-sourced transaction — extraction never auto-confirms.
 *
 * Currency invariant: a draft can only post onto an account of the SAME
 * currency. The draft is auto-assigned to a default account at extraction time,
 * which may differ in currency (e.g. an EUR invoice on an MDL account). Posting
 * a foreign-currency amount onto an account would silently corrupt its balance,
 * so we block it and ask the user to pick (or create) a matching account. An
 * optional `accountId` lets the user reassign the draft to a compatible account
 * as part of confirming.
 *
 * Security: org from server context; RLS + explicit filters ensure the user can
 * only confirm their own org's planned, document-sourced draft, and only move it
 * onto an account they own.
 */
export async function confirmDocumentTransactionAction(
  transactionId: string,
  accountId?: string,
): Promise<ConfirmDocumentTransactionResult> {
  if (!uuidSchema.safeParse(transactionId).success) {
    return { error: "Invalid transaction ID." };
  }
  if (accountId !== undefined && !uuidSchema.safeParse(accountId).success) {
    return { error: "Invalid account ID." };
  }

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to confirm transactions." };
  }

  const supabase = await createClient();

  // Load the planned draft to learn its currency + current account before posting.
  const { data: draft, error: draftError } = await supabase
    .from("money_transactions")
    .select("id, currency, account_id")
    .eq("id", transactionId)
    .eq("organization_id", ctx.org.id)
    .eq("status", "planned")
    .not("source_document_id", "is", null)
    .is("deleted_at", null)
    .maybeSingle();

  if (draftError) {
    console.error("confirmDocumentTransaction load error:", draftError);
    return { error: "The transaction could not be confirmed." };
  }
  if (!draft) {
    return { error: "Draft transaction not found or already confirmed." };
  }

  // Resolve the target account (caller may reassign to a compatible one).
  const targetAccountId = accountId ?? (draft.account_id as string | null);
  if (!targetAccountId) {
    return { error: "Select an account before confirming.", code: "currency_mismatch", requiredCurrency: draft.currency as string };
  }

  const { data: account, error: accountError } = await supabase
    .from("money_accounts")
    .select("id, currency")
    .eq("id", targetAccountId)
    .eq("organization_id", ctx.org.id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (accountError) {
    console.error("confirmDocumentTransaction account error:", accountError);
    return { error: "The transaction could not be confirmed." };
  }
  if (!account) {
    return { error: "The selected account is unavailable. Pick another account." };
  }

  // Currency invariant: never post a foreign-currency amount onto an account.
  if ((account.currency as string) !== (draft.currency as string)) {
    return {
      error: `This is a ${draft.currency} document. Pick a ${draft.currency} account to confirm it.`,
      code: "currency_mismatch",
      requiredCurrency: draft.currency as string,
    };
  }

  const { data: confirmed, error } = await supabase
    .from("money_transactions")
    .update({ status: "posted", account_id: targetAccountId, updated_by: ctx.user.id })
    .eq("id", transactionId)
    .eq("organization_id", ctx.org.id)
    .eq("status", "planned")
    .not("source_document_id", "is", null)
    .is("deleted_at", null)
    .select("id, amount, type, source_document_id")
    .maybeSingle();

  if (error) {
    console.error("confirmDocumentTransaction error:", error);
    return { error: "The transaction could not be confirmed." };
  }
  if (!confirmed) {
    return { error: "Draft transaction not found or already confirmed." };
  }

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "money.transaction.confirmed",
      aggregateType: "transaction",
      aggregateId: confirmed.id as string,
      payload: {
        amount: Number(confirmed.amount),
        type: confirmed.type as string,
        source_document_id: (confirmed.source_document_id as string | null) ?? null,
      },
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "money_transactions",
      entityId: confirmed.id as string,
      action: "status_change",
      oldData: { status: "planned" },
      newData: { status: "posted" },
      metadata: { source: "dashboard" },
    }),
  ]);

  // Resolve the related Action Center review item(s).
  await supabase
    .from("action_items")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("organization_id", ctx.org.id)
    .eq("source_type", "transaction")
    .eq("source_id", transactionId)
    .in("status", ["open", "in_progress", "snoozed"]);

  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.actions);
  if (confirmed.source_document_id) {
    revalidatePath(`${ROUTES.documents}/${confirmed.source_document_id}`);
  }
  return {};
}
