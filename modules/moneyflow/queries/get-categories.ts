import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { MoneyCategory } from "../types/moneyflow.types";
import type { CategoryType } from "../constants/moneyflow.constants";

/**
 * Query: получить категории пользователя.
 *
 * Параметр filterType — для фильтрации по типу:
 * - undefined → все категории
 * - "income" → только категории доходов
 * - "expense" → только категории расходов
 *
 * Зачем фильтр: в форме транзакции тип "income" должен показывать
 * только income-категории. Если показать все — пользователь может
 * выбрать "Еда" для дохода, что бессмысленно.
 *
 * Сортировка: is_default первыми (системные наверху), потом по имени.
 */
export async function getCategories(
  filterType?: CategoryType,
): Promise<MoneyCategory[]> {
  const supabase = await createClient();

  let query = supabase
    .from("money_categories")
    .select("*")
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });

  if (filterType) {
    query = query.eq("type", filterType);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getCategories error:", error);
    return [];
  }

  return data as MoneyCategory[];
}
