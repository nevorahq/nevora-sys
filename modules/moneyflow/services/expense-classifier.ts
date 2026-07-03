import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";

export const CLASSIFIER_VERSION = "smart-categories-v1";

export type ClassificationMethod =
  | "user_rule"
  | "history"
  | "subscription"
  | "system_rule"
  | "ai"
  | "manual"
  | "unclassified";

export interface ExpenseContextOption {
  id: string;
  slug: "personal" | "family" | "work";
  name: string;
  visibility: "organization" | "private";
  owner_user_id: string | null;
}

export interface ExpenseClassification {
  normalizedMerchant: string;
  categoryId: string | null;
  expenseContextId: string | null;
  visibility: "organization" | "private";
  ownerUserId: string | null;
  categoryConfidence: number;
  contextConfidence: number;
  method: ClassificationMethod;
  reason: string;
  matchedSignals: string[];
  classifierVersion: string;
}

type CategoryRow = { id: string; name: string; system_key: string | null };

const SYSTEM_PATTERNS: Array<{ key: string; patterns: RegExp[] }> = [
  { key: "transport", patterns: [/\bbolt\b/i, /\buber\b/i, /taxi/i, /transport/i, /такси/i, /транспорт/i] },
  { key: "subscriptions", patterns: [/netflix/i, /spotify/i, /subscription/i, /подписк/i, /abonament/i] },
  { key: "software", patterns: [/adobe/i, /canva/i, /github/i, /openai/i, /notion/i, /slack/i, /software/i, /saas/i] },
  { key: "food", patterns: [/restaurant/i, /cafe/i, /coffee/i, /market/i, /food/i, /glovo/i, /еда/i, /продукт/i, /restaurant/i] },
  { key: "office", patterns: [/office/i, /stationery/i, /канцеляр/i, /birou/i] },
  { key: "taxes", patterns: [/tax/i, /vat/i, /ндс/i, /налог/i, /impozit/i] },
  { key: "health", patterns: [/pharmacy/i, /medical/i, /clinic/i, /аптек/i, /здоров/i, /farmacie/i] },
  { key: "home", patterns: [/utilities/i, /electric/i, /internet/i, /home/i, /дом/i, /casă/i] },
  { key: "marketing", patterns: [/facebook ads/i, /google ads/i, /marketing/i, /реклам/i, /publicitate/i] },
  { key: "travel", patterns: [/hotel/i, /airbnb/i, /airline/i, /flight/i, /travel/i, /командиров/i, /călător/i] },
];

export function normalizeMerchantName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s]/gi, " ")
    .replace(/\bs\s+r\s+l\b/gi, " ")
    .replace(/\b(srl|llc|ltd|inc|sa)\b/gi, " ")
    .replace(/(^|\s)(ооо|ип)(?=\s|$)/gi, " ")
    .replace(/\bno(?=\d)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export async function getExpenseContexts(
  supabase: SupabaseClient,
  ctx: CurrentContext,
): Promise<ExpenseContextOption[]> {
  const { data, error } = await supabase.rpc("ensure_expense_contexts", {
    p_organization_id: ctx.org.id,
    p_workspace_id: ctx.workspace.id,
  });

  if (!error && data) return data as ExpenseContextOption[];

  const { data: fallback } = await supabase
    .from("expense_contexts")
    .select("id, slug, name, visibility, owner_user_id")
    .eq("organization_id", ctx.org.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  return (fallback as ExpenseContextOption[] | null) ?? [];
}

export async function classifyExpense(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: {
    merchantName: string | null;
    itemNames?: string[];
    aiCategoryHints?: Array<string | null | undefined>;
  },
): Promise<ExpenseClassification> {
  const normalizedMerchant = normalizeMerchantName(input.merchantName) || "unknown merchant";
  const [contexts, categoriesResult, rulesResult] = await Promise.all([
    getExpenseContexts(supabase, ctx),
    supabase
      .from("money_categories")
      .select("id, name, system_key")
      .eq("organization_id", ctx.org.id)
      .eq("type", "expense")
      .eq("is_active", true),
    supabase
      .from("expense_classification_rules")
      .select("category_id, expense_context_id, visibility, owner_user_id, priority")
      .eq("organization_id", ctx.org.id)
      .eq("normalized_merchant", normalizedMerchant)
      .eq("is_active", true)
      .order("priority", { ascending: false }),
  ]);

  const categories = (categoriesResult.data as CategoryRow[] | null) ?? [];
  const rules = (rulesResult.data as Array<{
    category_id: string | null;
    expense_context_id: string | null;
    visibility: "organization" | "private";
    owner_user_id: string | null;
  }> | null) ?? [];

  const privateRule = rules.find((rule) => rule.visibility === "private" && rule.owner_user_id === ctx.user.id);
  const rule = privateRule ?? rules.find((candidate) => candidate.visibility === "organization");

  if (rule) {
    const context = contexts.find((candidate) => candidate.id === rule.expense_context_id);
    const isPrivate = context?.visibility === "private";
    return {
      normalizedMerchant,
      categoryId: rule.category_id,
      expenseContextId: rule.expense_context_id,
      visibility: isPrivate ? "private" : "organization",
      ownerUserId: isPrivate ? ctx.user.id : null,
      categoryConfidence: 0.99,
      contextConfidence: 0.99,
      method: "user_rule",
      reason: "Matched a saved merchant rule.",
      matchedSignals: ["normalized_merchant", "saved_rule"],
      classifierVersion: CLASSIFIER_VERSION,
    };
  }

  const ruleSearchable = [normalizedMerchant, ...(input.itemNames ?? [])].join(" ");
  const aiSearchable = (input.aiCategoryHints ?? []).filter((value): value is string => Boolean(value)).join(" ");
  const matchedSystemKey = matchSystemCategoryKey(ruleSearchable);
  const matchedAiKey = matchedSystemKey ? null : matchSystemCategoryKey(aiSearchable);
  const categoryKey = matchedSystemKey ?? matchedAiKey ?? "other";
  const category = categories.find((candidate) => candidate.system_key === categoryKey)
    ?? findCategoryByName(categories, categoryKey);
  const workContext = contexts.find((context) => context.slug === "work" && context.visibility === "organization") ?? null;

  return {
    normalizedMerchant,
    categoryId: category?.id ?? null,
    expenseContextId: workContext?.id ?? null,
    visibility: "organization",
    ownerUserId: null,
    categoryConfidence: matchedSystemKey ? 0.78 : matchedAiKey ? 0.7 : 0.4,
    contextConfidence: 0.55,
    method: matchedSystemKey ? "system_rule" : matchedAiKey ? "ai" : "unclassified",
    reason: matchedSystemKey
      ? `Matched the built-in ${categoryKey} signals. Review the suggested Work context.`
      : matchedAiKey
        ? `Used the extracted AI category hint for ${categoryKey}. Review before confirming.`
      : "No strong merchant signal was found. Review the fallback category and context.",
    matchedSignals: matchedSystemKey
      ? ["merchant_or_item_keyword", categoryKey]
      : matchedAiKey
        ? ["ai_item_category", categoryKey]
        : ["fallback_other"],
    classifierVersion: CLASSIFIER_VERSION,
  };
}

export function matchSystemCategoryKey(searchable: string): string | null {
  return SYSTEM_PATTERNS.find((candidate) => candidate.patterns.some((regex) => regex.test(searchable)))?.key ?? null;
}

export async function recordClassificationDecision(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  transactionId: string,
  classification: ExpenseClassification,
): Promise<void> {
  const { error } = await supabase.from("transaction_classifications").insert({
    organization_id: ctx.org.id,
    workspace_id: ctx.workspace.id,
    transaction_id: transactionId,
    owner_user_id: classification.ownerUserId,
    visibility: classification.visibility,
    category_id: classification.categoryId,
    expense_context_id: classification.expenseContextId,
    category_confidence: classification.categoryConfidence,
    context_confidence: classification.contextConfidence,
    method: classification.method,
    reason: classification.reason,
    matched_signals: classification.matchedSignals,
    classifier_version: classification.classifierVersion,
    created_by: ctx.user.id,
  });
  if (error) console.error("recordClassificationDecision error:", error.message);
}

/**
 * Persist a user correction as a private merchant rule so future expenses from
 * the same merchant classify the same way (spec §9: "remember this choice").
 *
 * Upserts the caller's own private rule for the normalized merchant. Org-visible
 * rules are intentionally NOT written here — a single user's correction must not
 * silently reclassify expenses for the whole organization. No-ops for an unknown
 * merchant (nothing reliable to key the rule on).
 */
export async function upsertPrivateMerchantRule(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  input: { normalizedMerchant: string; categoryId: string | null; expenseContextId: string | null },
): Promise<string | null> {
  const normalizedMerchant = input.normalizedMerchant;
  if (!normalizedMerchant || normalizedMerchant === "unknown merchant") return null;

  const { data: existingRule } = await supabase
    .from("expense_classification_rules")
    .select("id, confirmation_count")
    .eq("organization_id", ctx.org.id)
    .eq("owner_user_id", ctx.user.id)
    .eq("normalized_merchant", normalizedMerchant)
    .eq("visibility", "private")
    .eq("is_active", true)
    .maybeSingle();

  const rulePayload = {
    category_id: input.categoryId,
    expense_context_id: input.expenseContextId,
    source: "manual",
    updated_at: new Date().toISOString(),
  };

  const ruleResult = existingRule
    ? await supabase
        .from("expense_classification_rules")
        .update({ ...rulePayload, confirmation_count: Number(existingRule.confirmation_count ?? 0) + 1 })
        .eq("id", existingRule.id)
        .eq("organization_id", ctx.org.id)
        .eq("owner_user_id", ctx.user.id)
        .select("id")
        .maybeSingle()
    : await supabase.from("expense_classification_rules").insert({
        organization_id: ctx.org.id,
        workspace_id: ctx.workspace.id,
        owner_user_id: ctx.user.id,
        visibility: "private",
        normalized_merchant: normalizedMerchant,
        ...rulePayload,
        created_by: ctx.user.id,
      })
        .select("id")
        .maybeSingle();
  if (ruleResult.error) console.error("upsertPrivateMerchantRule error:", ruleResult.error.message);
  return (ruleResult.data as { id?: string } | null)?.id ?? null;
}

function findCategoryByName(categories: CategoryRow[], key: string): CategoryRow | undefined {
  const aliases: Record<string, string[]> = {
    food: ["food", "еда", "питание", "mancare"],
    transport: ["transport", "транспорт", "taxi"],
    software: ["software", "saas", "софт"],
    office: ["office", "офис", "birou"],
    taxes: ["tax", "налог", "impozit"],
    health: ["health", "здоров", "sanatate"],
    home: ["home", "дом", "casa"],
    marketing: ["marketing", "маркетинг", "publicitate"],
    travel: ["travel", "командиров", "calator"],
    subscriptions: ["subscription", "подпис", "abonament"],
    other: ["other", "прочее", "другое", "altele"],
  };
  return categories.find((category) => {
    const name = normalizeMerchantName(category.name);
    return (aliases[key] ?? [key]).some((alias) => name.includes(alias));
  });
}
