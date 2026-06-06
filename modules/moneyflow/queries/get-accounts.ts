import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { MoneyAccount } from "../types/moneyflow.types";

/**
 * Query: получить все счета пользователя.
 *
 * Где используется:
 * - Money page: список счетов
 * - Форма транзакции: dropdown "Выберите счёт"
 *
 * По умолчанию: только активные (is_active = true).
 * Параметр includeInactive — для страницы настроек (будущее).
 *
 * Сортировка: по дате создания (старые первыми) — логичный порядок
 * для счетов (первый добавленный = основной).
 *
 * RLS: SELECT вернёт только счета текущего пользователя.
 */
export async function getAccounts(
  options: { includeInactive?: boolean } = {},
): Promise<MoneyAccount[]> {
  const supabase = await createClient();

  let query = supabase
    .from("money_accounts")
    .select("*")
    .order("created_at", { ascending: true });

  if (!options.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getAccounts error:", error);
    return [];
  }

  return data as MoneyAccount[];
}
