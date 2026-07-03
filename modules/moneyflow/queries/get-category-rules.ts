import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Query: categorization rules visible to the caller — the org-wide set plus
 * the caller's own private rules (RLS enforces the same; the explicit filters
 * keep multi-org sessions scoped and make intent obvious).
 */

export interface CategoryRule {
  id: string;
  normalized_merchant: string;
  visibility: "private" | "organization";
  owner_user_id: string | null;
  priority: number;
  confirmation_count: number;
  is_active: boolean;
  source: "manual" | "history" | "system";
  created_at: string;
  category: { id: string; name: string } | null;
  expense_context: { id: string; name: string } | null;
}

export async function getCategoryRules(organizationId: string): Promise<CategoryRule[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("expense_classification_rules")
    .select(
      "id, normalized_merchant, visibility, owner_user_id, priority, confirmation_count, is_active, source, created_at, category:money_categories(id, name), expense_context:expense_contexts(id, name)",
    )
    .eq("organization_id", organizationId)
    .order("visibility", { ascending: false }) // private first (own rules on top)
    .order("priority", { ascending: false })
    .order("normalized_merchant", { ascending: true })
    .limit(200);

  if (error) {
    console.error("getCategoryRules error:", error.message);
    return [];
  }

  return ((data ?? []) as unknown[]).map((row) => {
    const rule = row as CategoryRule & {
      category: CategoryRule["category"] | Array<NonNullable<CategoryRule["category"]>>;
      expense_context: CategoryRule["expense_context"] | Array<NonNullable<CategoryRule["expense_context"]>>;
    };
    return {
      ...rule,
      category: Array.isArray(rule.category) ? (rule.category[0] ?? null) : rule.category,
      expense_context: Array.isArray(rule.expense_context)
        ? (rule.expense_context[0] ?? null)
        : rule.expense_context,
    };
  });
}
