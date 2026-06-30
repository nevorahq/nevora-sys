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
  options: { limit?: number; monthStart?: string; nextMonthStart?: string } = {},
): Promise<MoneyTransactionWithRelations[]> {
  const { limit = 20, monthStart, nextMonthStart } = options;

  const supabase = await createClient();

  let query = supabase
    .from("money_transactions")
    // money_accounts is now referenced by 3 FKs (account_id, from_account_id,
    // to_account_id) — disambiguate each embed by its FK column.
    .select(
      "*, account:money_accounts!account_id(name), category:money_categories(name), from_account:money_accounts!from_account_id(name), to_account:money_accounts!to_account_id(name)",
    )
    // Recent Transactions — леджер фактов. Запланированные (planned)
    // показываются отдельно в блоке «Предстоящие расходы».
    .eq("status", "posted")
    // Никогда не показываем мягко удалённые/замещённые строки, иначе после
    // повторной экстракции/отклонения в ленте остаются «призрачные» дубли.
    .is("deleted_at", null);

  // History navigator: scope the ledger to a UTC month window when provided.
  // Without it (e.g. dashboard overview) the latest posted facts are returned.
  if (monthStart) query = query.gte("transaction_date", monthStart);
  if (nextMonthStart) query = query.lt("transaction_date", nextMonthStart);

  const { data, error } = await query
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getTransactions error:", error);
    return [];
  }

  return data as MoneyTransactionWithRelations[];
}
