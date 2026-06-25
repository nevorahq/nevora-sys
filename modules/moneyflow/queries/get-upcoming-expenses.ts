import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { getRatesToBase, sumInBase } from "./fx-conversion";

/**
 * Прогноз «Предстоящие расходы» — сумма ожидаемых списаний в окне
 * `сегодня … конец текущего месяца` из плановых транзакций:
 *
 *   planned-транзакции (status='planned', type='expense') — отложенные
 *   расходы, которые ещё не проведены и не влияют на баланс. При создании
 *   подписки такая транзакция создаётся автоматически на next_billing_date.
 *
 * Это ПРОГНОЗ: данные не входят в Balance/Monthly Expenses (см.
 * getMoneySummary, который считает только status='posted'). Подписки не
 * суммируются напрямую: их уже представляет созданная planned-транзакция,
 * поэтому двойного учёта нет.
 *
 * Валюты НЕ суммируются в одно число (как и getMoneySummary): предстоящие
 * расходы разбиты по валюте транзакции. Кросс-валютная нормализация в
 * base_currency — отдельный FX-слой, пока не внедрён.
 *
 * RLS гарантирует scope по текущей организации.
 */
export interface UpcomingExpenses {
  /** Предстоящие расходы за окно, раздельно по валютам. */
  byCurrency: { currency: string; total: number }[];
  /** Сводный итог в базовой валюте организации. */
  base: { currency: string; total: number; complete: boolean };
  /** Количество planned-транзакций в окне, включая созданные из подписок. */
  plannedCount: number;
}

export async function getUpcomingExpenses(): Promise<UpcomingExpenses> {
  const supabase = await createClient();
  const { org } = await requireOrg();
  const baseCurrency = org.baseCurrency;

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  const { data, error } = await supabase
    .from("money_transactions")
    .select("amount, currency")
    .eq("status", "planned")
    .eq("type", "expense")
    .gte("transaction_date", today)
    .lte("transaction_date", monthEnd);

  if (error) {
    console.error("getUpcomingExpenses error:", error);
    return {
      byCurrency: [],
      base: { currency: baseCurrency, total: 0, complete: true },
      plannedCount: 0,
    };
  }

  const plannedRows = data ?? [];

  // currency → сумма. Каждая валюта остаётся изолированной.
  const totals = new Map<string, number>();
  for (const row of plannedRows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + Number(row.amount));
  }

  // Приведение к базовой валюте организации.
  const { rates, complete } = await getRatesToBase(
    supabase,
    [...totals.keys()],
    baseCurrency,
  );

  return {
    byCurrency: [...totals.entries()]
      .map(([currency, total]) => ({ currency, total }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    base: {
      currency: baseCurrency,
      total: sumInBase(totals, rates),
      complete,
    },
    plannedCount: plannedRows.length,
  };
}
