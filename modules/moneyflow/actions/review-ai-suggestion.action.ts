"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import {
  CLASSIFIER_VERSION,
  upsertPrivateMerchantRule,
} from "../services/expense-classifier";

/**
 * Accept / edit / reject flow for money_ai_suggestions (Phase 5, spec §11).
 *
 * Accepting applies the suggested category to the transaction; passing an
 * overrideCategoryId records the review as 'edited' and applies the override.
 * Rejecting only flips the suggestion status — the transaction goes back to
 * 'uncategorized' and is never touched otherwise. Both paths append a
 * transaction_classifications provenance row and emit domain events.
 */

const acceptSchema = z.object({
  suggestionId: uuidSchema,
  overrideCategoryId: uuidSchema.optional(),
  rememberChoice: z.boolean().default(false),
});

const rejectSchema = z.object({ suggestionId: uuidSchema });

type SuggestionRow = {
  id: string;
  transaction_id: string;
  suggested_category_id: string | null;
  suggested_type: "income" | "expense" | null;
  normalized_merchant_name: string | null;
  confidence: number;
  source: "history" | "system" | "ai";
  status: string;
};

export async function acceptMoneyAiSuggestionAction(
  input: z.input<typeof acceptSchema>,
): Promise<{ error?: string }> {
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid suggestion." };

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to categorize transactions." };
  }

  const supabase = await createClient();
  const suggestion = await loadPendingSuggestion(supabase, ctx.org.id, parsed.data.suggestionId);
  if ("error" in suggestion) return suggestion;

  const isEdited = Boolean(
    parsed.data.overrideCategoryId &&
      parsed.data.overrideCategoryId !== suggestion.suggested_category_id,
  );
  const categoryId = parsed.data.overrideCategoryId ?? suggestion.suggested_category_id;
  if (!categoryId) {
    return { error: "This suggestion has no matching category — choose one to apply." };
  }

  // The category must belong to the org and match the suggested transaction type.
  const { data: category } = await supabase
    .from("money_categories")
    .select("id, type")
    .eq("id", categoryId)
    .eq("organization_id", ctx.org.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!category || (suggestion.suggested_type && category.type !== suggestion.suggested_type)) {
    return { error: "The selected category is unavailable for this transaction." };
  }

  const confidence = isEdited ? 1 : Number(suggestion.confidence);
  const { data: updatedTx, error: txError } = await supabase
    .from("money_transactions")
    .update({
      category_id: categoryId,
      category_source: isEdited ? "manual" : suggestion.source === "ai" ? "ai" : suggestion.source,
      category_confidence: confidence,
      categorization_status: "confirmed",
      updated_by: ctx.user.id,
    })
    .eq("id", suggestion.transaction_id)
    .eq("organization_id", ctx.org.id)
    .is("deleted_at", null)
    .select("id, visibility, owner_user_id, workspace_id")
    .maybeSingle();

  if (txError || !updatedTx) {
    if (txError) console.error("acceptMoneyAiSuggestion tx update error:", txError.message);
    return { error: "The transaction could not be updated." };
  }

  const { error: reviewError } = await supabase
    .from("money_ai_suggestions")
    .update({
      status: isEdited ? "edited" : "accepted",
      ...(isEdited ? { suggested_category_id: categoryId } : {}),
      reviewed_by: ctx.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", suggestion.id)
    .eq("organization_id", ctx.org.id)
    .eq("status", "pending");
  if (reviewError) console.error("acceptMoneyAiSuggestion review error:", reviewError.message);

  // Provenance row (append-only), mirroring the existing classifier trail.
  const { error: decisionError } = await supabase.from("transaction_classifications").insert({
    organization_id: ctx.org.id,
    workspace_id: ctx.workspace.id,
    transaction_id: suggestion.transaction_id,
    owner_user_id: updatedTx.owner_user_id,
    visibility: updatedTx.visibility,
    category_id: categoryId,
    category_confidence: confidence,
    context_confidence: null,
    method: isEdited ? "manual" : suggestion.source === "ai" ? "ai" : "history",
    reason: isEdited
      ? "User edited an AI category suggestion before applying it."
      : `User accepted a ${suggestion.source} category suggestion.`,
    matched_signals: ["money_ai_suggestion", suggestion.source],
    classifier_version: CLASSIFIER_VERSION,
    created_by: ctx.user.id,
  });
  if (decisionError) console.error("acceptMoneyAiSuggestion decision error:", decisionError.message);

  // Optional learning step: remember the merchant → category choice as the
  // caller's private rule so the next transaction skips AI entirely.
  if (parsed.data.rememberChoice && suggestion.normalized_merchant_name) {
    await upsertPrivateMerchantRule(supabase, ctx, {
      normalizedMerchant: suggestion.normalized_merchant_name,
      categoryId,
      expenseContextId: null,
    });
    await emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "money.category_rule.created",
      aggregateType: "transaction",
      aggregateId: suggestion.transaction_id,
      payload: { category_id: categoryId, merchant: suggestion.normalized_merchant_name },
    });
  }

  await Promise.all([
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "money.ai_suggestion.accepted",
      aggregateType: "money_ai_suggestion",
      aggregateId: suggestion.id,
      payload: {
        transaction_id: suggestion.transaction_id,
        category_id: categoryId,
        source: suggestion.source,
        confidence,
        edited: isEdited,
      },
    }),
    emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "money.transaction.categorized",
      aggregateType: "transaction",
      aggregateId: suggestion.transaction_id,
      payload: {
        transaction_id: suggestion.transaction_id,
        category_id: categoryId,
        category_source: isEdited ? "manual" : suggestion.source,
        confidence,
      },
    }),
    emitAuditLog({
      organizationId: ctx.org.id,
      entityType: "money_transactions",
      entityId: suggestion.transaction_id,
      action: "update",
      newData: { category_id: categoryId, categorization_status: "confirmed" },
      metadata: { source: "dashboard", suggestion_id: suggestion.id },
    }),
  ]);

  revalidatePath(ROUTES.money);
  revalidatePath(`${ROUTES.money}/${suggestion.transaction_id}`);
  return {};
}

export async function rejectMoneyAiSuggestionAction(
  input: z.infer<typeof rejectSchema>,
): Promise<{ error?: string }> {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid suggestion." };

  const ctx = await requireOrg();
  if (!canDo(ctx, "data.write")) {
    return { error: "You do not have permission to review suggestions." };
  }

  const supabase = await createClient();
  const suggestion = await loadPendingSuggestion(supabase, ctx.org.id, parsed.data.suggestionId);
  if ("error" in suggestion) return suggestion;

  const { error: reviewError } = await supabase
    .from("money_ai_suggestions")
    .update({
      status: "rejected",
      reviewed_by: ctx.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", suggestion.id)
    .eq("organization_id", ctx.org.id)
    .eq("status", "pending");
  if (reviewError) {
    console.error("rejectMoneyAiSuggestion review error:", reviewError.message);
    return { error: "The suggestion could not be updated." };
  }

  // The transaction returns to the uncategorized queue; its category is untouched.
  const { error: txError } = await supabase
    .from("money_transactions")
    .update({ categorization_status: "uncategorized", updated_by: ctx.user.id })
    .eq("id", suggestion.transaction_id)
    .eq("organization_id", ctx.org.id)
    .eq("categorization_status", "suggested")
    .is("deleted_at", null);
  if (txError) console.error("rejectMoneyAiSuggestion tx status error:", txError.message);

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "money.ai_suggestion.rejected",
    aggregateType: "money_ai_suggestion",
    aggregateId: suggestion.id,
    payload: { transaction_id: suggestion.transaction_id, source: suggestion.source },
  });

  revalidatePath(ROUTES.money);
  revalidatePath(`${ROUTES.money}/${suggestion.transaction_id}`);
  return {};
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function loadPendingSuggestion(
  supabase: SupabaseServerClient,
  organizationId: string,
  suggestionId: string,
): Promise<SuggestionRow | { error: string }> {
  const { data, error } = await supabase
    .from("money_ai_suggestions")
    .select("id, transaction_id, suggested_category_id, suggested_type, normalized_merchant_name, confidence, source, status")
    .eq("id", suggestionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("loadPendingSuggestion error:", error.message);
    return { error: "The suggestion could not be loaded." };
  }
  if (!data) return { error: "Suggestion not found." };
  if ((data as SuggestionRow).status !== "pending") {
    return { error: "This suggestion was already reviewed." };
  }
  return data as SuggestionRow;
}
