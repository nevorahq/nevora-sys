import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { MoneyTransactionWithRelations } from "../types/moneyflow.types";

/**
 * Query: получить транзакции пользователя с JOIN-данными.
 *
 * Supabase select с вложенными таблицами:
 *   .select("*, account:money_accounts(name), category:money_categories(name)")
 *
 * Это эквивалент SQL:
 *   SELECT t.*, a.name as account_name, c.name as category_name
 *   FROM money_transactions t
 *   LEFT JOIN money_accounts a ON t.account_id = a.id
 *   LEFT JOIN money_categories c ON t.category_id = c.id
 *
 * Зачем JOIN: в UI нужно показать "Карта" и "Еда", а не UUID.
 * Без JOIN — нужен второй запрос для каждого account/category.
 *
 * Параметр limit: для Dashboard overview достаточно 5 последних.
 * Для полного списка — limit = 50 или пагинация (будущее).
 *
 * Сортировка: новые первыми (transaction_date DESC, created_at DESC).
 * Двойная сортировка: если несколько транзакций в один день —
 * последняя добавленная наверху.
 */
export async function getTransactions(
  options: { limit?: number } = {},
): Promise<MoneyTransactionWithRelations[]> {
  const { limit = 20 } = options;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("money_transactions")
    .select("*, account:money_accounts(name), category:money_categories(name)")
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getTransactions error:", error);
    return [];
  }

  return data as MoneyTransactionWithRelations[];
}
