import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { MoneySummary } from "../types/moneyflow.types";

/**
 * Query: получить финансовое summary пользователя.
 *
 * Возвращает:
 * - balance: общий баланс по ВСЕМ активным счетам
 *   (initial_balance + SUM(income) - SUM(expense))
 * - monthlyIncome: сумма доходов за текущий месяц
 * - monthlyExpenses: сумма расходов за текущий месяц
 *
 * Стратегия:
 * 1. Получаем все активные accounts (для initial_balance)
 * 2. Получаем все transactions текущего месяца (для income/expense)
 * 3. Считаем агрегаты на сервере (не в БД через SQL View)
 *
 * Почему не SQL View / RPC:
 * Для MVP — проще и понятнее считать в коде.
 * При масштабировании (1000+ транзакций) — вынести в PostgreSQL function.
 *
 * RLS гарантирует: SELECT вернёт только данные текущего пользователя.
 */
export async function getMoneySummary(): Promise<MoneySummary> {
  const supabase = await createClient();

  // Текущий месяц: первый и последний день
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  // Параллельно: accounts + transactions текущего месяца
  const [accountsResult, transactionsResult] = await Promise.all([
    supabase
      .from("money_accounts")
      .select("initial_balance")
      .eq("is_active", true),

    supabase
      .from("money_transactions")
      .select("type, amount")
      .gte("transaction_date", monthStart)
      .lte("transaction_date", monthEnd),
  ]);

  // Сумма initial_balance по всем активным счетам
  const initialBalanceTotal = (accountsResult.data ?? []).reduce(
    (sum, acc) => sum + Number(acc.initial_balance),
    0,
  );

  // Доходы и расходы за месяц
  let monthlyIncome = 0;
  let monthlyExpenses = 0;

  for (const tx of transactionsResult.data ?? []) {
    const amount = Number(tx.amount);
    if (tx.type === "income") {
      monthlyIncome += amount;
    } else {
      monthlyExpenses += amount;
    }
  }

  // Для полного баланса нужны ВСЕ транзакции (не только текущий месяц)
  const allTransactionsResult = await supabase
    .from("money_transactions")
    .select("type, amount");

  let allTimeIncome = 0;
  let allTimeExpenses = 0;

  for (const tx of allTransactionsResult.data ?? []) {
    const amount = Number(tx.amount);
    if (tx.type === "income") {
      allTimeIncome += amount;
    } else {
      allTimeExpenses += amount;
    }
  }

  const balance = initialBalanceTotal + allTimeIncome - allTimeExpenses;

  return {
    balance,
    monthlyIncome,
    monthlyExpenses,
  };
}
