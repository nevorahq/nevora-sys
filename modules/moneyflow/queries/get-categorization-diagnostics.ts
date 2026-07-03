import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Query: admin diagnostics for the categorization pipeline (Phase 5.1 §4.6).
 * Cheap HEAD count queries — no row data leaves the database.
 *
 * Scope: whole org, all time (posted income/expense only). This is an ops
 * health view, not analytics — the month-scoped product view lives in
 * get-category-intelligence.
 */

export const TRANSACTION_DIAG_STATUSES = [
  "uncategorized",
  "processing",
  "suggested",
  "confirmed",
  "failed",
] as const;

export const SUGGESTION_DIAG_STATUSES = [
  "pending",
  "accepted",
  "edited",
  "rejected",
  "expired",
] as const;

export interface CategorizationDiagnostics {
  transactions: Record<(typeof TRANSACTION_DIAG_STATUSES)[number], number>;
  suggestions: Record<(typeof SUGGESTION_DIAG_STATUSES)[number], number>;
}

export async function getCategorizationDiagnostics(
  organizationId: string,
): Promise<CategorizationDiagnostics> {
  const supabase = await createClient();

  const txCounts = TRANSACTION_DIAG_STATUSES.map((status) =>
    supabase
      .from("money_transactions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "posted")
      .in("type", ["income", "expense"])
      .eq("categorization_status", status)
      .is("deleted_at", null),
  );
  const suggestionCounts = SUGGESTION_DIAG_STATUSES.map((status) =>
    supabase
      .from("money_ai_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", status),
  );

  const results = await Promise.all([...txCounts, ...suggestionCounts]);

  const transactions = {} as CategorizationDiagnostics["transactions"];
  TRANSACTION_DIAG_STATUSES.forEach((status, index) => {
    const { count, error } = results[index];
    if (error) console.error("getCategorizationDiagnostics tx error:", error.message);
    transactions[status] = count ?? 0;
  });

  const suggestions = {} as CategorizationDiagnostics["suggestions"];
  SUGGESTION_DIAG_STATUSES.forEach((status, index) => {
    const { count, error } = results[TRANSACTION_DIAG_STATUSES.length + index];
    if (error) console.error("getCategorizationDiagnostics suggestion error:", error.message);
    suggestions[status] = count ?? 0;
  });

  return { transactions, suggestions };
}
