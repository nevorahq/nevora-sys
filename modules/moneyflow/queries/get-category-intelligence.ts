import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";

/**
 * Query: lightweight category-intelligence metrics for one month window
 * (Phase 5, spec §12.5). Simple cards, not a full analytics foundation:
 *   • uncategorized amount + count
 *   • categorization source split (manual / rules+history / ai)
 *   • top merchants by spend
 *   • income by category
 *
 * Expenses-by-category already exists (get-expense-breakdown) and is not
 * duplicated here. Amounts are grouped per currency — no FX conversion.
 */

export interface MoneyAmount {
  currency: string;
  amount: number;
}

export interface CategoryIntelligence {
  uncategorized: { count: number; amounts: MoneyAmount[] };
  sources: { manual: number; rules: number; ai: number };
  topMerchants: Array<{ merchant: string; amounts: MoneyAmount[]; count: number }>;
  incomeByCategory: Array<{ categoryId: string | null; name: string; amounts: MoneyAmount[]; count: number }>;
}

const EMPTY: CategoryIntelligence = {
  uncategorized: { count: 0, amounts: [] },
  sources: { manual: 0, rules: 0, ai: 0 },
  topMerchants: [],
  incomeByCategory: [],
};

type Row = {
  type: "income" | "expense";
  amount: number;
  currency: string;
  category_id: string | null;
  category_source: string | null;
  merchant_name: string | null;
  normalized_merchant_name: string | null;
  title: string;
  category: { name: string } | { name: string }[] | null;
};

export async function getCategoryIntelligence(window: {
  monthStart: string;
  nextMonthStart: string;
}): Promise<CategoryIntelligence> {
  const ctx = await requireOrg();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("money_transactions")
    .select(
      "type, amount, currency, category_id, category_source, merchant_name, normalized_merchant_name, title, category:money_categories(name)",
    )
    .eq("organization_id", ctx.org.id)
    .eq("status", "posted")
    .in("type", ["income", "expense"])
    .is("deleted_at", null)
    .gte("transaction_date", window.monthStart)
    .lt("transaction_date", window.nextMonthStart)
    .limit(2000);

  if (error) {
    console.error("getCategoryIntelligence error:", error.message);
    return EMPTY;
  }

  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return EMPTY;

  const uncategorizedAmounts = new Map<string, number>();
  let uncategorizedCount = 0;
  const sources = { manual: 0, rules: 0, ai: 0 };
  const merchants = new Map<string, { label: string; amounts: Map<string, number>; count: number }>();
  const income = new Map<string, { name: string; amounts: Map<string, number>; count: number }>();

  for (const row of rows) {
    const amount = Number(row.amount);

    if (!row.category_id) {
      uncategorizedCount += 1;
      uncategorizedAmounts.set(row.currency, (uncategorizedAmounts.get(row.currency) ?? 0) + amount);
    } else {
      switch (row.category_source) {
        case "ai":
          sources.ai += 1;
          break;
        case "rule":
        case "history":
        case "system":
        case "import":
          sources.rules += 1;
          break;
        default:
          sources.manual += 1;
      }
    }

    if (row.type === "expense") {
      const key = row.normalized_merchant_name || (row.merchant_name ?? "").toLowerCase().trim();
      if (key) {
        const entry = merchants.get(key) ?? {
          label: row.merchant_name ?? row.title,
          amounts: new Map<string, number>(),
          count: 0,
        };
        entry.count += 1;
        entry.amounts.set(row.currency, (entry.amounts.get(row.currency) ?? 0) + amount);
        merchants.set(key, entry);
      }
    } else {
      const key = row.category_id ?? "none";
      const categoryName = Array.isArray(row.category) ? row.category[0]?.name : row.category?.name;
      const entry = income.get(key) ?? {
        name: categoryName ?? "Uncategorized",
        amounts: new Map<string, number>(),
        count: 0,
      };
      entry.count += 1;
      entry.amounts.set(row.currency, (entry.amounts.get(row.currency) ?? 0) + amount);
      income.set(key, entry);
    }
  }

  const toAmounts = (map: Map<string, number>): MoneyAmount[] =>
    [...map.entries()].map(([currency, amount]) => ({ currency, amount }));
  const total = (map: Map<string, number>): number =>
    [...map.values()].reduce((sum, value) => sum + value, 0);

  return {
    uncategorized: { count: uncategorizedCount, amounts: toAmounts(uncategorizedAmounts) },
    sources,
    topMerchants: [...merchants.values()]
      .sort((a, b) => total(b.amounts) - total(a.amounts))
      .slice(0, 5)
      .map((m) => ({ merchant: m.label, amounts: toAmounts(m.amounts), count: m.count })),
    incomeByCategory: [...income.entries()]
      .sort((a, b) => total(b[1].amounts) - total(a[1].amounts))
      .slice(0, 6)
      .map(([key, value]) => ({
        categoryId: key === "none" ? null : key,
        name: value.name,
        amounts: toAmounts(value.amounts),
        count: value.count,
      })),
  };
}
