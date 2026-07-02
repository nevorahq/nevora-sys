import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { emitDomainEvent } from "@/lib/events";
import {
  CLASSIFIER_VERSION,
  matchSystemCategoryKey,
  normalizeMerchantName,
  recordClassificationDecision,
} from "./expense-classifier";
import { suggestCategoryWithAi } from "./ai-category-suggestion";
import { CONFIDENCE_MIN_SUGGESTION } from "../constants/moneyflow.constants";

/**
 * Rule-first categorization pipeline for a posted money transaction (Phase 5).
 *
 * Order (spec §9.2): user rule → merchant history → system keywords → AI →
 * uncategorized fallback. A user rule is the user's own prior decision, so it
 * is applied directly (source='rule'). Everything softer (history/system/AI)
 * only creates a reviewable money_ai_suggestions row — the transaction itself
 * is never silently changed; the user accepts, edits or rejects.
 *
 * AI is called last and only when `allowAi` is true AND the org's monthly
 * ai_calls quota admits another request. AI failures mark the transaction
 * 'failed' and never throw.
 */

export type CategorizeOutcome =
  | { outcome: "already_categorized" }
  | { outcome: "not_found" }
  | { outcome: "rule_applied"; categoryId: string }
  | { outcome: "suggested"; suggestionId: string; source: "history" | "system" | "ai"; confidence: number }
  | { outcome: "uncategorized" }
  | { outcome: "ai_failed" }
  | { outcome: "ai_quota_exceeded" };

type TxRow = {
  id: string;
  title: string;
  note: string | null;
  type: "income" | "expense";
  amount: number;
  currency: string;
  transaction_date: string;
  merchant_name: string | null;
  category_id: string | null;
  categorization_status: string;
  visibility: "organization" | "private";
  owner_user_id: string | null;
};

type CategoryRow = { id: string; name: string; type: "income" | "expense"; system_key: string | null };

export async function categorizeTransaction(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  transactionId: string,
  options: { allowAi?: boolean; force?: boolean } = {},
): Promise<CategorizeOutcome> {
  const { allowAi = true, force = false } = options;

  const { data: tx } = await supabase
    .from("money_transactions")
    .select(
      "id, title, note, type, amount, currency, transaction_date, merchant_name, category_id, categorization_status, visibility, owner_user_id",
    )
    .eq("id", transactionId)
    .eq("organization_id", ctx.org.id)
    .eq("status", "posted")
    .in("type", ["income", "expense"])
    .is("deleted_at", null)
    .maybeSingle();

  if (!tx) return { outcome: "not_found" };
  const transaction = tx as TxRow;

  if (!force && (transaction.categorization_status === "confirmed" || transaction.category_id)) {
    return { outcome: "already_categorized" };
  }

  const normalizedMerchant = normalizeMerchantName(transaction.merchant_name ?? transaction.title);

  const { data: categoriesData } = await supabase
    .from("money_categories")
    .select("id, name, type, system_key")
    .eq("organization_id", ctx.org.id)
    .eq("type", transaction.type)
    .eq("is_active", true);
  const categories = (categoriesData as CategoryRow[] | null) ?? [];

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "money.transaction.categorization_requested",
    aggregateType: "transaction",
    aggregateId: transaction.id,
    payload: { transaction_id: transaction.id, type: transaction.type },
  });

  // ── 1. User merchant rule (expense taxonomy only) — applied directly ──
  if (transaction.type === "expense" && normalizedMerchant) {
    const { data: rules } = await supabase
      .from("expense_classification_rules")
      .select("category_id, expense_context_id, visibility, owner_user_id")
      .eq("organization_id", ctx.org.id)
      .eq("normalized_merchant", normalizedMerchant)
      .eq("is_active", true)
      .order("priority", { ascending: false });

    const ruleRows = (rules as Array<{
      category_id: string | null;
      expense_context_id: string | null;
      visibility: "organization" | "private";
      owner_user_id: string | null;
    }> | null) ?? [];
    const rule =
      ruleRows.find((r) => r.visibility === "private" && r.owner_user_id === ctx.user.id) ??
      ruleRows.find((r) => r.visibility === "organization");

    if (rule?.category_id) {
      const applied = await applyCategory(supabase, ctx, transaction, {
        categoryId: rule.category_id,
        source: "rule",
        confidence: 0.99,
        normalizedMerchant,
        expenseContextId: rule.expense_context_id,
      });
      if (applied) {
        await recordClassificationDecision(supabase, ctx, transaction.id, {
          normalizedMerchant,
          categoryId: rule.category_id,
          expenseContextId: rule.expense_context_id,
          visibility: transaction.visibility,
          ownerUserId: transaction.owner_user_id,
          categoryConfidence: 0.99,
          contextConfidence: 0.99,
          method: "user_rule",
          reason: "Matched a saved merchant rule during categorization.",
          matchedSignals: ["normalized_merchant", "saved_rule"],
          classifierVersion: CLASSIFIER_VERSION,
        });
        return { outcome: "rule_applied", categoryId: rule.category_id };
      }
    }
  }

  // ── 2. Merchant history from previously confirmed transactions ──
  if (normalizedMerchant) {
    const { data: history } = await supabase
      .from("money_transactions")
      .select("category_id")
      .eq("organization_id", ctx.org.id)
      .eq("normalized_merchant_name", normalizedMerchant)
      .eq("type", transaction.type)
      .eq("categorization_status", "confirmed")
      .eq("status", "posted")
      .is("deleted_at", null)
      .not("category_id", "is", null)
      .neq("id", transaction.id)
      .limit(25);

    const counts = new Map<string, number>();
    for (const row of (history as Array<{ category_id: string }> | null) ?? []) {
      counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const [categoryId, occurrences] = top;
      const category = categories.find((c) => c.id === categoryId);
      if (category) {
        return await createSuggestion(supabase, ctx, transaction, {
          source: "history",
          categoryId: category.id,
          categoryName: category.name,
          confidence: occurrences >= 2 ? 0.85 : 0.7,
          normalizedMerchant,
          reasoning:
            occurrences >= 2
              ? `You confirmed "${category.name}" for this merchant ${occurrences} times before.`
              : `You previously confirmed "${category.name}" for this merchant.`,
          tags: ["merchant_history"],
        });
      }
    }
  }

  // ── 3. Deterministic system keyword rules (expense taxonomy) ──
  if (transaction.type === "expense") {
    const searchable = `${normalizedMerchant} ${transaction.title}`;
    const systemKey = matchSystemCategoryKey(searchable);
    const category = systemKey ? categories.find((c) => c.system_key === systemKey) : undefined;
    if (category) {
      return await createSuggestion(supabase, ctx, transaction, {
        source: "system",
        categoryId: category.id,
        categoryName: category.name,
        confidence: 0.78,
        normalizedMerchant,
        reasoning: `The merchant/title matches the built-in "${category.name}" signals.`,
        tags: ["system_keyword", systemKey as string],
      });
    }
  }

  // ── 4. AI categorization (quota-guarded, structured output) ──
  if (allowAi) {
    return await categorizeWithAi(supabase, ctx, transaction, categories, normalizedMerchant);
  }

  await setCategorizationStatus(supabase, ctx, transaction.id, "uncategorized", normalizedMerchant);
  return { outcome: "uncategorized" };
}

// ── helpers ─────────────────────────────────────────────────

async function categorizeWithAi(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  transaction: TxRow,
  categories: CategoryRow[],
  normalizedMerchant: string,
): Promise<CategorizeOutcome> {
  if (categories.length === 0) {
    await setCategorizationStatus(supabase, ctx, transaction.id, "uncategorized", normalizedMerchant);
    return { outcome: "uncategorized" };
  }

  // The ai_requests INSERT is the atomic quota guard (trigger from 033/052);
  // a rejected insert means the monthly ai_calls quota is exhausted.
  const { data: request, error: requestError } = await supabase
    .from("ai_requests")
    .insert({ organization_id: ctx.org.id, user_id: ctx.user.id, action_type: "transaction_categorization" })
    .select("id")
    .single();
  if (requestError || !request) {
    await setCategorizationStatus(supabase, ctx, transaction.id, "uncategorized", normalizedMerchant);
    return { outcome: "ai_quota_exceeded" };
  }

  const result = await suggestCategoryWithAi({
    title: transaction.title,
    note: transaction.note,
    merchantName: transaction.merchant_name,
    amount: Number(transaction.amount),
    currency: transaction.currency,
    transactionDate: transaction.transaction_date,
    transactionType: transaction.type,
    availableCategories: categories.map((c) => c.name),
  });

  if (!result.ok) {
    await supabase.from("ai_requests").update({ status: "failed" }).eq("id", request.id);
    await setCategorizationStatus(supabase, ctx, transaction.id, "failed", normalizedMerchant);
    return { outcome: "ai_failed" };
  }

  await supabase
    .from("ai_requests")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", request.id);

  // Map the AI's category_name back onto the org taxonomy (exact,
  // case-insensitive). An unmatched name is kept as text with no category id;
  // the user resolves it via "Change category" on accept.
  const suggested = result.suggestion;
  const matched = categories.find(
    (c) => c.name.trim().toLowerCase() === suggested.category_name.trim().toLowerCase(),
  );

  return await createSuggestion(supabase, ctx, transaction, {
    source: "ai",
    categoryId: matched?.id ?? null,
    categoryName: matched?.name ?? suggested.category_name,
    confidence: suggested.confidence,
    normalizedMerchant: normalizeMerchantName(suggested.merchant_name) || normalizedMerchant,
    merchantName: suggested.merchant_name ?? transaction.merchant_name,
    reasoning: suggested.reasoning,
    tags: suggested.tags,
    rawInput: result.rawInput,
    rawOutput: result.rawOutput as Record<string, unknown>,
  });
}

/** Direct application — reserved for the user's own saved rules. */
async function applyCategory(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  transaction: TxRow,
  input: {
    categoryId: string;
    source: "rule";
    confidence: number;
    normalizedMerchant: string;
    expenseContextId: string | null;
  },
): Promise<boolean> {
  const { data: updated, error } = await supabase
    .from("money_transactions")
    .update({
      category_id: input.categoryId,
      category_source: input.source,
      category_confidence: input.confidence,
      categorization_status: "confirmed",
      normalized_merchant_name: input.normalizedMerchant || null,
      ...(input.expenseContextId ? { expense_context_id: input.expenseContextId } : {}),
      updated_by: ctx.user.id,
    })
    .eq("id", transaction.id)
    .eq("organization_id", ctx.org.id)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    if (error) console.error("[categorizeTransaction] rule apply failed:", error.message);
    return false;
  }

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "money.transaction.categorized",
    aggregateType: "transaction",
    aggregateId: transaction.id,
    payload: {
      transaction_id: transaction.id,
      category_id: input.categoryId,
      category_source: input.source,
      confidence: input.confidence,
    },
  });
  return true;
}

async function createSuggestion(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  transaction: TxRow,
  input: {
    source: "history" | "system" | "ai";
    categoryId: string | null;
    categoryName: string;
    confidence: number;
    normalizedMerchant: string;
    merchantName?: string | null;
    reasoning: string;
    tags: string[];
    rawInput?: Record<string, unknown>;
    rawOutput?: Record<string, unknown>;
  },
): Promise<CategorizeOutcome> {
  // One pending suggestion per transaction: retire the previous one first.
  await supabase
    .from("money_ai_suggestions")
    .update({ status: "expired", reviewed_by: ctx.user.id, reviewed_at: new Date().toISOString() })
    .eq("organization_id", ctx.org.id)
    .eq("transaction_id", transaction.id)
    .eq("status", "pending");

  const { data: suggestion, error } = await supabase
    .from("money_ai_suggestions")
    .insert({
      organization_id: ctx.org.id,
      workspace_id: ctx.workspace.id,
      transaction_id: transaction.id,
      suggested_category_id: input.categoryId,
      suggested_category_name: input.categoryName,
      suggested_type: transaction.type,
      merchant_name: input.merchantName ?? transaction.merchant_name,
      normalized_merchant_name: input.normalizedMerchant || null,
      confidence: clampConfidence(input.confidence),
      reasoning: input.reasoning.slice(0, 1000),
      tags: input.tags.slice(0, 8),
      source: input.source,
      raw_input: input.rawInput ?? {},
      raw_output: input.rawOutput ?? {},
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (error || !suggestion) {
    console.error("[categorizeTransaction] suggestion insert failed:", error?.message);
    await setCategorizationStatus(supabase, ctx, transaction.id, "failed", input.normalizedMerchant);
    return { outcome: "ai_failed" };
  }

  // Below the minimum band the suggestion is stored for transparency but the
  // transaction stays uncategorized (spec §17).
  const strongEnough = input.confidence >= CONFIDENCE_MIN_SUGGESTION;
  await setCategorizationStatus(
    supabase,
    ctx,
    transaction.id,
    strongEnough ? "suggested" : "uncategorized",
    input.normalizedMerchant,
  );

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "money.ai_suggestion.created",
    aggregateType: "money_ai_suggestion",
    aggregateId: suggestion.id as string,
    payload: {
      transaction_id: transaction.id,
      suggested_category_id: input.categoryId,
      source: input.source,
      confidence: clampConfidence(input.confidence),
    },
  });

  return strongEnough
    ? { outcome: "suggested", suggestionId: suggestion.id as string, source: input.source, confidence: input.confidence }
    : { outcome: "uncategorized" };
}

async function setCategorizationStatus(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  transactionId: string,
  status: "uncategorized" | "suggested" | "failed",
  normalizedMerchant: string,
): Promise<void> {
  const { error } = await supabase
    .from("money_transactions")
    .update({
      categorization_status: status,
      normalized_merchant_name: normalizedMerchant || null,
      updated_by: ctx.user.id,
    })
    .eq("id", transactionId)
    .eq("organization_id", ctx.org.id);
  if (error) console.error("[categorizeTransaction] status update failed:", error.message);
}

function clampConfidence(value: number): number {
  return Math.min(1, Math.max(0, Number(value.toFixed(4))));
}
