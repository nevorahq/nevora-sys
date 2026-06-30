"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { emitAuditLog } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import {
  CLASSIFIER_VERSION,
  normalizeMerchantName,
  upsertPrivateMerchantRule,
} from "../services/expense-classifier";

const recategorizeSchema = z.object({
  transactionId: uuidSchema,
  categoryId: uuidSchema,
  expenseContextId: uuidSchema,
  rememberChoice: z.boolean().default(false),
});

export type RecategorizeExpenseInput = z.infer<typeof recategorizeSchema>;

/**
 * Re-classify a posted expense from the "Where the money went" summary.
 *
 * This is the user-facing "fix category" correction (spec §4, §9). It updates
 * the transaction's category + expense context, appends a manual classification
 * decision (provenance), and — when the user opts in — saves a private merchant
 * rule so future expenses from the same merchant classify the same way.
 *
 * Security: org from server context; only posted, non-deleted transactions the
 * caller can see (RLS + explicit filters) are touched. Private contexts can only
 * be applied by their owner.
 */
export async function recategorizeExpenseAction(
  input: RecategorizeExpenseInput,
): Promise<{ error?: string }> {
  const parsed = recategorizeSchema.safeParse(input);
  if (!parsed.success) return { error: "Select a valid category and expense context." };

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to change expenses." };
  }

  const supabase = await createClient();

  // Load the posted transaction (org-scoped, not deleted) to learn its merchant.
  const { data: transaction, error: txError } = await supabase
    .from("money_transactions")
    .select("id, merchant_name, title, type")
    .eq("id", parsed.data.transactionId)
    .eq("organization_id", ctx.org.id)
    .eq("status", "posted")
    .eq("type", "expense")
    .is("deleted_at", null)
    .maybeSingle();

  if (txError) {
    console.error("recategorizeExpense load error:", txError.message);
    return { error: "The expense could not be updated." };
  }
  if (!transaction) {
    return { error: "Expense not found or it is no longer editable." };
  }

  // Validate the chosen category + context belong to the org (and that a private
  // context belongs to the current user).
  const [categoryResult, contextResult] = await Promise.all([
    supabase
      .from("money_categories")
      .select("id")
      .eq("id", parsed.data.categoryId)
      .eq("organization_id", ctx.org.id)
      .eq("type", "expense")
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("expense_contexts")
      .select("id, visibility, owner_user_id")
      .eq("id", parsed.data.expenseContextId)
      .eq("organization_id", ctx.org.id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (!categoryResult.data || !contextResult.data) {
    return { error: "The selected category or expense context is unavailable." };
  }

  const context = contextResult.data as {
    id: string;
    visibility: "organization" | "private";
    owner_user_id: string | null;
  };
  if (context.visibility === "private" && context.owner_user_id !== ctx.user.id) {
    return { error: "You cannot use another member's private expense context." };
  }

  const visibility = context.visibility;
  const ownerUserId = visibility === "private" ? ctx.user.id : null;

  const { data: updated, error: updateError } = await supabase
    .from("money_transactions")
    .update({
      category_id: parsed.data.categoryId,
      expense_context_id: parsed.data.expenseContextId,
      visibility,
      owner_user_id: ownerUserId,
      updated_by: ctx.user.id,
    })
    .eq("id", parsed.data.transactionId)
    .eq("organization_id", ctx.org.id)
    .eq("status", "posted")
    .is("deleted_at", null)
    .select("id, category_id, expense_context_id")
    .maybeSingle();

  if (updateError) {
    console.error("recategorizeExpense update error:", updateError.message);
    return { error: "The expense could not be updated." };
  }
  if (!updated) {
    return { error: "Expense not found or it is no longer editable." };
  }

  // Append a manual classification decision (provenance).
  const { error: decisionError } = await supabase.from("transaction_classifications").insert({
    organization_id: ctx.org.id,
    workspace_id: ctx.workspace.id,
    transaction_id: updated.id,
    owner_user_id: ownerUserId,
    visibility,
    category_id: parsed.data.categoryId,
    expense_context_id: parsed.data.expenseContextId,
    category_confidence: 1,
    context_confidence: 1,
    method: "manual",
    reason: "User corrected the category from the expense summary.",
    matched_signals: ["expense_summary_correction"],
    classifier_version: CLASSIFIER_VERSION,
    created_by: ctx.user.id,
  });
  if (decisionError) console.error("recategorizeExpense classification decision error:", decisionError.message);

  if (parsed.data.rememberChoice) {
    await upsertPrivateMerchantRule(supabase, ctx, {
      normalizedMerchant: normalizeMerchantName(
        (transaction.merchant_name as string | null) ?? (transaction.title as string | null),
      ),
      categoryId: parsed.data.categoryId,
      expenseContextId: parsed.data.expenseContextId,
    });
  }

  await emitAuditLog({
    organizationId: ctx.org.id,
    entityType: "money_transactions",
    entityId: updated.id as string,
    action: "update",
    newData: {
      category_id: parsed.data.categoryId,
      expense_context_id: parsed.data.expenseContextId,
    },
    metadata: { source: "dashboard" },
  });

  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  return {};
}
