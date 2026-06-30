import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { getRatesToBase } from "./fx-conversion";
import type { CurrencySummary, MoneySummary } from "../types/moneyflow.types";

/**
 * Query: получить финансовое summary пользователя — РАЗДЕЛЬНО ПО ВАЛЮТАМ.
 *
 * Для каждой валюты возвращает:
 * - balance: SUM(initial_balance этой валюты) + SUM(income) - SUM(expense)
 * - monthlyIncome: доходы за текущий месяц
 * - monthlyExpenses: расходы за текущий месяц
 *
 * ВАЖНО (мультивалютность): суммы НЕ конвертируются. USD и MDL считаются
 * как отдельные строки `byCurrency`. Складывать amount разных валют в одно
 * число — финансово некорректно (1 USD ≠ 1 MDL). Конвертация в base_currency
 * организации — отдельный FX-слой (exchange_rates + fn_get_exchange_rate),
 * который пока не внедрён; до тех пор честнее показывать разбивку по валютам.
 *
 * Почему не SQL View / RPC:
 * Для MVP — проще и понятнее считать в коде.
 * При масштабировании (1000+ транзакций) — вынести в PostgreSQL function.
 *
 * RLS гарантирует: SELECT вернёт только данные текущего пользователя.
 */
/**
 * @param options.monthStart / nextMonthStart — UTC month window for the monthly
 * income/expenses metrics (history navigator). Defaults to the current month.
 * Balance is always the live cumulative total and is NOT scoped to the window.
 */
export async function getMoneySummary(
  options: { monthStart?: string; nextMonthStart?: string } = {},
): Promise<MoneySummary> {
  const supabase = await createClient();
  const { org } = await requireOrg();
  const baseCurrency = org.baseCurrency;

  // Текущий месяц в UTC. Границы СТРОГО в UTC (Date.UTC), иначе на сервере со
  // смещением +N часов локальная полночь 1-го числа уезжает в предыдущий день,
  // и крайние дни месяца (29–31) выпадают из выборки, хотя transaction_date —
  // это DATE без таймзоны. Верхняя граница — исключающая (< 1-е число след.
  // месяца), чтобы не вычислять «последний день» вручную.
  const now = new Date();
  const monthStart = options.monthStart
    ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const nextMonthStart = options.nextMonthStart
    ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

  // Параллельно: активные счета + все posted-транзакции + транзакции месяца.
  // Фильтры строго как в каноничной RPC get_org_money_summary (миграция 041):
  //   - счета: is_active = true AND deleted_at IS NULL
  //   - транзакции: status = 'posted' AND deleted_at IS NULL
  // Без `deleted_at IS NULL` мягко удалённая строка «протекает» в кумулятивный
  // Current Balance (planned исключены статусом и не влияют на баланс).
  const [accountsResult, allTxResult, monthTxResult] = await Promise.all([
    supabase
      .from("money_accounts")
      .select("initial_balance, currency")
      .eq("is_active", true)
      .is("deleted_at", null),

    supabase
      .from("money_transactions")
      .select("type, amount, currency")
      .eq("status", "posted")
      .is("deleted_at", null)
      // Transfers (type='transfer') net to zero per currency and are NOT
      // income/expense — exclude them so they never touch totals or analytics.
      .in("type", ["income", "expense"]),

    supabase
      .from("money_transactions")
      .select("type, amount, currency")
      .eq("status", "posted")
      .is("deleted_at", null)
      .in("type", ["income", "expense"])
      .gte("transaction_date", monthStart)
      .lt("transaction_date", nextMonthStart),
  ]);

  // currency → агрегат. Map сохраняет каждую валюту изолированной.
  const byCurrency = new Map<string, CurrencySummary>();
  const bucket = (currency: string): CurrencySummary => {
    let entry = byCurrency.get(currency);
    if (!entry) {
      entry = { currency, balance: 0, monthlyIncome: 0, monthlyExpenses: 0 };
      byCurrency.set(currency, entry);
    }
    return entry;
  };

  // Стартовый баланс счетов — в валюте счёта.
  for (const acc of accountsResult.data ?? []) {
    bucket(acc.currency).balance += Number(acc.initial_balance);
  }

  // Полный баланс: все posted-транзакции, в валюте транзакции.
  for (const tx of allTxResult.data ?? []) {
    const entry = bucket(tx.currency);
    const amount = Number(tx.amount);
    entry.balance += tx.type === "income" ? amount : -amount;
  }

  // Доходы/расходы текущего месяца, в валюте транзакции.
  for (const tx of monthTxResult.data ?? []) {
    const entry = bucket(tx.currency);
    const amount = Number(tx.amount);
    if (tx.type === "income") {
      entry.monthlyIncome += amount;
    } else {
      entry.monthlyExpenses += amount;
    }
  }

  const rows = [...byCurrency.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );

  // Приведение к базовой валюте организации через fn_get_exchange_rate.
  const { rates, complete } = await getRatesToBase(
    supabase,
    rows.map((r) => r.currency),
    baseCurrency,
  );

  const base = {
    currency: baseCurrency,
    balance: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    complete,
  };
  for (const row of rows) {
    const rate = rates.get(row.currency);
    if (rate == null) continue; // валюта без курса — уже учтено в complete
    base.balance += row.balance * rate;
    base.monthlyIncome += row.monthlyIncome * rate;
    base.monthlyExpenses += row.monthlyExpenses * rate;
  }

  return { byCurrency: rows, base };
}
