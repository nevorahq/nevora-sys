import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { MoneyAiSuggestion } from "../types/moneyflow.types";

/**
 * Query: posted income/expense transactions without a confirmed category,
 * plus their pending suggestion (if the pipeline already produced one).
 *
 * Powers /dashboard/money?filter=uncategorized. Transfers never appear —
 * they carry no category by design (migration 067).
 *
 * Explicit organizationId filter (multi-org: RLS alone admits every org the
 * caller belongs to).
 */

export interface UncategorizedTransaction {
  id: string;
  title: string;
  type: "income" | "expense";
  amount: number;
  currency: string;
  transaction_date: string;
  merchant_name: string | null;
  categorization_status: string;
  account: { name: string } | null;
  pendingSuggestion: Pick<
    MoneyAiSuggestion,
    "id" | "suggested_category_id" | "suggested_category_name" | "confidence" | "reasoning" | "source"
  > | null;
}

export async function getUncategorizedTransactions(
  organizationId: string,
  options: { limit?: number; monthStart?: string; nextMonthStart?: string } = {},
): Promise<UncategorizedTransaction[]> {
  const { limit = 50, monthStart, nextMonthStart } = options;
  const supabase = await createClient();

  let query = supabase
    .from("money_transactions")
    .select(
      "id, title, type, amount, currency, transaction_date, merchant_name, categorization_status, account:money_accounts!account_id(name)",
    )
    .eq("organization_id", organizationId)
    .eq("status", "posted")
    .in("type", ["income", "expense"])
    .is("category_id", null)
    .is("deleted_at", null);

  if (monthStart) query = query.gte("transaction_date", monthStart);
  if (nextMonthStart) query = query.lt("transaction_date", nextMonthStart);

  const { data, error } = await query
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getUncategorizedTransactions error:", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as Array<Omit<UncategorizedTransaction, "pendingSuggestion">>;
  if (rows.length === 0) return [];

  const { data: suggestions, error: suggestionsError } = await supabase
    .from("money_ai_suggestions")
    .select("id, transaction_id, suggested_category_id, suggested_category_name, confidence, reasoning, source")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .in("transaction_id", rows.map((row) => row.id));

  if (suggestionsError) {
    console.error("getUncategorizedTransactions suggestions error:", suggestionsError.message);
  }

  const byTransaction = new Map(
    ((suggestions ?? []) as Array<{ transaction_id: string } & UncategorizedTransaction["pendingSuggestion"] & object>).map(
      (s) => [s.transaction_id, s],
    ),
  );

  return rows.map((row) => ({
    ...row,
    account: Array.isArray(row.account) ? (row.account[0] ?? null) : row.account,
    pendingSuggestion: (byTransaction.get(row.id) as UncategorizedTransaction["pendingSuggestion"]) ?? null,
  }));
}

/** Count for the filter badge on the Money page. */
export async function getUncategorizedCount(
  organizationId: string,
  options: { monthStart?: string; nextMonthStart?: string } = {},
): Promise<number> {
  const supabase = await createClient();

  let query = supabase
    .from("money_transactions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "posted")
    .in("type", ["income", "expense"])
    .is("category_id", null)
    .is("deleted_at", null);

  if (options.monthStart) query = query.gte("transaction_date", options.monthStart);
  if (options.nextMonthStart) query = query.lt("transaction_date", options.nextMonthStart);

  const { count, error } = await query;
  if (error) {
    console.error("getUncategorizedCount error:", error.message);
    return 0;
  }
  return count ?? 0;
}
