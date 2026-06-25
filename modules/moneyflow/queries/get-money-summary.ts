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
export async function getMoneySummary(): Promise<MoneySummary> {
  const supabase = await createClient();
  const { org } = await requireOrg();
  const baseCurrency = org.baseCurrency;

  // Текущий месяц: первый и последний день
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  // Параллельно: активные счета + все posted-транзакции + транзакции месяца.
  // planned исключаем — они не влияют на баланс до проведения (см.
  // getUpcomingExpenses).
  const [accountsResult, allTxResult, monthTxResult] = await Promise.all([
    supabase
      .from("money_accounts")
      .select("initial_balance, currency")
      .eq("is_active", true),

    supabase
      .from("money_transactions")
      .select("type, amount, currency")
      .eq("status", "posted"),

    supabase
      .from("money_transactions")
      .select("type, amount, currency")
      .eq("status", "posted")
      .gte("transaction_date", monthStart)
      .lte("transaction_date", monthEnd),
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
