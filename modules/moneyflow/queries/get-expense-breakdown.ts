import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";

export interface ExpenseTransactionRow {
  id: string;
  title: string;
  amount: number;
  currency: string;
  date: string;
  categoryId: string | null;
  expenseContextId: string | null;
  confidence: number | null;
  sourceDocumentId: string | null;
  /** Latest classification method (e.g. "ai", "user_rule", "manual"), if any. */
  method: string | null;
  /** Human-readable reason for the latest classification, if any. */
  reason: string | null;
}

export interface ExpenseBreakdownGroup {
  /** Stable key: `${entityId|none}:${currency}`. */
  id: string;
  /** category_id / expense_context_id this group rolls up (null = unassigned). */
  entityId: string | null;
  name: string;
  currency: string;
  amount: number;
  transactionCount: number;
  transactions: ExpenseTransactionRow[];
}

export interface ExpenseCategoryOption {
  id: string;
  name: string;
}

export interface ExpenseContextOption {
  id: string;
  name: string;
  visibility: "organization" | "private";
}

export interface ExpenseBreakdown {
  periodStart: string;
  byCategory: ExpenseBreakdownGroup[];
  byContext: ExpenseBreakdownGroup[];
  categoryOptions: ExpenseCategoryOption[];
  contextOptions: ExpenseContextOption[];
}

type ClassificationEmbed = { reason: string | null; method: string | null; created_at: string };

const EMPTY: ExpenseBreakdown = {
  periodStart: "",
  byCategory: [],
  byContext: [],
  categoryOptions: [],
  contextOptions: [],
};

/**
 * @param options.monthStart / nextMonthStart — UTC month window (history
 * navigator). Defaults to the current month. Upper bound is exclusive.
 */
export async function getExpenseBreakdown(
  options: { monthStart?: string; nextMonthStart?: string } = {},
): Promise<ExpenseBreakdown> {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const now = new Date();
  const periodStart = options.monthStart
    ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const periodEnd = options.nextMonthStart
    ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

  const [txResult, categoriesResult, contextsResult] = await Promise.all([
    supabase
      .from("money_transactions")
      .select(`
        id,
        title,
        amount,
        currency,
        category_id,
        expense_context_id,
        transaction_date,
        confidence_score,
        source_document_id,
        money_categories (name),
        expense_contexts (name),
        transaction_classifications (reason, method, created_at)
      `)
      .eq("organization_id", ctx.org.id)
      .eq("type", "expense")
      .eq("status", "posted")
      .gte("transaction_date", periodStart)
      .lt("transaction_date", periodEnd)
      .is("deleted_at", null)
      .order("transaction_date", { ascending: false })
      .limit(500),
    supabase
      .from("money_categories")
      .select("id, name")
      .eq("organization_id", ctx.org.id)
      .eq("type", "expense")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("expense_contexts")
      .select("id, name, visibility")
      .eq("organization_id", ctx.org.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
  ]);

  if (txResult.error) {
    console.error("getExpenseBreakdown error:", txResult.error.message);
    return { ...EMPTY, periodStart };
  }

  const categoryGroups = new Map<string, ExpenseBreakdownGroup>();
  const contextGroups = new Map<string, ExpenseBreakdownGroup>();

  for (const row of txResult.data ?? []) {
    const amount = Number(row.amount);
    const currency = row.currency as string;
    const latest = latestClassification(row.transaction_classifications as ClassificationEmbed[] | null);
    const tx: ExpenseTransactionRow = {
      id: row.id as string,
      title: (row.title as string | null)?.trim() || "Untitled expense",
      amount,
      currency,
      date: row.transaction_date as string,
      categoryId: (row.category_id as string | null) ?? null,
      expenseContextId: (row.expense_context_id as string | null) ?? null,
      confidence: row.confidence_score == null ? null : Number(row.confidence_score),
      sourceDocumentId: (row.source_document_id as string | null) ?? null,
      method: latest?.method ?? null,
      reason: latest?.reason ?? null,
    };

    addGroup(
      categoryGroups,
      `${row.category_id ?? "none"}:${currency}`,
      (row.category_id as string | null) ?? null,
      relationName(row.money_categories) ?? "Uncategorized",
      currency,
      tx,
    );
    addGroup(
      contextGroups,
      `${row.expense_context_id ?? "none"}:${currency}`,
      (row.expense_context_id as string | null) ?? null,
      relationName(row.expense_contexts) ?? "No context",
      currency,
      tx,
    );
  }

  return {
    periodStart,
    byCategory: sortGroups(categoryGroups),
    byContext: sortGroups(contextGroups),
    categoryOptions: (categoriesResult.data as ExpenseCategoryOption[] | null) ?? [],
    contextOptions: (contextsResult.data as ExpenseContextOption[] | null) ?? [],
  };
}

/** Most recent classification decision for a transaction, if any. */
function latestClassification(rows: ClassificationEmbed[] | null): ClassificationEmbed | null {
  if (!rows || rows.length === 0) return null;
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

function relationName(value: unknown): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object" || !("name" in row)) return null;
  return typeof row.name === "string" ? row.name : null;
}

function addGroup(
  groups: Map<string, ExpenseBreakdownGroup>,
  id: string,
  entityId: string | null,
  name: string,
  currency: string,
  tx: ExpenseTransactionRow,
): void {
  const current = groups.get(id);
  if (current) {
    current.amount += tx.amount;
    current.transactionCount += 1;
    current.transactions.push(tx);
    return;
  }
  groups.set(id, { id, entityId, name, currency, amount: tx.amount, transactionCount: 1, transactions: [tx] });
}

function sortGroups(groups: Map<string, ExpenseBreakdownGroup>): ExpenseBreakdownGroup[] {
  return [...groups.values()].sort((a, b) => b.amount - a.amount);
}
