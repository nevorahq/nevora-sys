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
 *
 * RLS (is_org_member) допускает любую org пользователя — при active
 * membership в нескольких сразу (multi-org, Phase 4.3) явный фильтр по
 * organizationId обязателен, иначе категории смешаются между организациями.
 */
export async function getCategories(
  organizationId: string,
  filterType?: CategoryType,
): Promise<MoneyCategory[]> {
  const supabase = await createClient();

  let query = supabase
    .from("money_categories")
    .select("*")
    .eq("organization_id", organizationId)
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
