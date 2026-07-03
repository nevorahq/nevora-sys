"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import { z } from "zod";
import { CLASSIFIER_VERSION, normalizeMerchantName, upsertPrivateMerchantRule } from "../services/expense-classifier";

const classificationReviewSchema = z.object({
  categoryId: uuidSchema,
  expenseContextId: uuidSchema,
  rememberChoice: z.boolean().default(false),
  merchantName: z.string().trim().min(1).max(240),
  amount: z.number().positive().max(999_999_999_999),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
});

export type ClassificationReviewInput = z.infer<typeof classificationReviewSchema>;

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
  classificationInput?: ClassificationReviewInput,
): Promise<ConfirmDocumentTransactionResult> {
  if (!uuidSchema.safeParse(transactionId).success) {
    return { error: "Invalid transaction ID." };
  }
  if (accountId !== undefined && !uuidSchema.safeParse(accountId).success) {
    return { error: "Invalid account ID." };
  }
  const parsedClassification = classificationInput
    ? classificationReviewSchema.safeParse(classificationInput)
    : null;
  if (parsedClassification && !parsedClassification.success) {
    return { error: "Select a valid category and expense context." };
  }

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to confirm transactions." };
  }

  const supabase = await createClient();

  // Load the planned draft to learn its currency + current account before posting.
  const { data: draft, error: draftError } = await supabase
    .from("money_transactions")
    .select("id, currency, account_id, merchant_name, category_id, expense_context_id, visibility, owner_user_id")
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

  const reviewedCurrency = parsedClassification?.success
    ? parsedClassification.data.currency
    : draft.currency as string;

  // Resolve the target account (caller may reassign to a compatible one).
  const targetAccountId = accountId ?? (draft.account_id as string | null);
  if (!targetAccountId) {
    return { error: "Select an account before confirming.", code: "currency_mismatch", requiredCurrency: reviewedCurrency };
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
  if ((account.currency as string) !== reviewedCurrency) {
    return {
      error: `This is a ${reviewedCurrency} document. Pick a ${reviewedCurrency} account to confirm it.`,
      code: "currency_mismatch",
      requiredCurrency: reviewedCurrency,
    };
  }

  let classificationUpdate: Record<string, unknown> = {};
  let selectedContext: {
    id: string;
    visibility: "organization" | "private";
    owner_user_id: string | null;
  } | undefined;

  if (parsedClassification?.success) {
    const [categoryResult, contextResult] = await Promise.all([
      supabase
        .from("money_categories")
        .select("id")
        .eq("id", parsedClassification.data.categoryId)
        .eq("organization_id", ctx.org.id)
        .eq("type", "expense")
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("expense_contexts")
        .select("id, visibility, owner_user_id")
        .eq("id", parsedClassification.data.expenseContextId)
        .eq("organization_id", ctx.org.id)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    if (!categoryResult.data || !contextResult.data) {
      return { error: "The selected category or expense context is unavailable." };
    }

    selectedContext = contextResult.data as {
      id: string;
      visibility: "organization" | "private";
      owner_user_id: string | null;
    };
    if (selectedContext?.visibility === "private" && selectedContext.owner_user_id !== ctx.user.id) {
      return { error: "You cannot use another member's private expense context." };
    }

    classificationUpdate = {
      category_id: parsedClassification.data.categoryId,
      expense_context_id: parsedClassification.data.expenseContextId,
      visibility: selectedContext?.visibility ?? "organization",
      owner_user_id: selectedContext?.visibility === "private" ? ctx.user.id : null,
      merchant_name: parsedClassification.data.merchantName,
      title: parsedClassification.data.merchantName,
      amount: parsedClassification.data.amount,
      transaction_date: parsedClassification.data.transactionDate,
      currency: parsedClassification.data.currency,
    };
  }

  const { data: confirmed, error } = await supabase
    .from("money_transactions")
    .update({
      status: "posted",
      account_id: targetAccountId,
      updated_by: ctx.user.id,
      ...classificationUpdate,
    })
    .eq("id", transactionId)
    .eq("organization_id", ctx.org.id)
    .eq("status", "planned")
    .not("source_document_id", "is", null)
    .is("deleted_at", null)
    .select("id, amount, type, source_document_id, category_id, expense_context_id, visibility, owner_user_id, merchant_name")
    .maybeSingle();

  if (error) {
    console.error("confirmDocumentTransaction error:", error);
    return { error: "The transaction could not be confirmed." };
  }
  if (!confirmed) {
    return { error: "Draft transaction not found or already confirmed." };
  }

  // Money Intelligence consistency (Phase 5.1): confirming a draft is an
  // explicit user decision, so a category carried by the confirmed row is a
  // manual, confirmed categorization — not a leftover 'uncategorized' default.
  if (confirmed.category_id) {
    const { error: catStateError } = await supabase
      .from("money_transactions")
      .update({
        categorization_status: "confirmed",
        category_source: "manual",
        normalized_merchant_name:
          normalizeMerchantName((confirmed.merchant_name as string | null) ?? null) || null,
        updated_by: ctx.user.id,
      })
      .eq("id", confirmed.id)
      .eq("organization_id", ctx.org.id);
    if (catStateError) console.error("confirmDocumentTransaction categorization state error:", catStateError.message);
  }

  if (parsedClassification?.success) {
    const decisionVisibility = (confirmed.visibility as "organization" | "private") ?? "organization";
    const decisionOwner = decisionVisibility === "private" ? ctx.user.id : null;
    const normalizedMerchant = normalizeMerchantName((confirmed.merchant_name as string | null) ?? (draft.merchant_name as string | null));

    const { error: decisionError } = await supabase.from("transaction_classifications").insert({
      organization_id: ctx.org.id,
      workspace_id: ctx.workspace.id,
      transaction_id: confirmed.id,
      owner_user_id: decisionOwner,
      visibility: decisionVisibility,
      category_id: parsedClassification.data.categoryId,
      expense_context_id: parsedClassification.data.expenseContextId,
      category_confidence: 1,
      context_confidence: 1,
      method: "manual",
      reason: "User confirmed the category and expense context during document review.",
      matched_signals: ["document_review"],
      classifier_version: CLASSIFIER_VERSION,
      created_by: ctx.user.id,
    });
    if (decisionError) console.error("confirmDocumentTransaction classification decision error:", decisionError.message);

    if (parsedClassification.data.rememberChoice) {
      await upsertPrivateMerchantRule(supabase, ctx, {
        normalizedMerchant,
        categoryId: parsedClassification.data.categoryId,
        expenseContextId: parsedClassification.data.expenseContextId,
      });
    }
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
        category_id: (confirmed.category_id as string | null) ?? null,
        expense_context_id: (confirmed.expense_context_id as string | null) ?? null,
      },
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "money_transactions",
      entityId: confirmed.id as string,
      action: "status_change",
      oldData: { status: "planned" },
      newData: {
        status: "posted",
        category_id: (confirmed.category_id as string | null) ?? null,
        expense_context_id: (confirmed.expense_context_id as string | null) ?? null,
      },
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
