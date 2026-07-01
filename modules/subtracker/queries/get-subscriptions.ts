import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Subscription } from "../types/subtracker.types";

/**
 * Query: получить все подписки текущей организации.
 *
 * По умолчанию только активные. Сортировка по next_billing_date —
 * ближайшие списания наверху.
 *
 * RLS (is_org_member) допускает любую org пользователя — при active
 * membership в нескольких сразу (multi-org, Phase 4.3) явный фильтр по
 * organizationId обязателен поверх RLS.
 */
export async function getSubscriptions(
  organizationId: string,
  options: { includeInactive?: boolean } = {},
): Promise<Subscription[]> {
  const supabase = await createClient();

  let query = supabase
    .from("subscriptions")
    .select("*")
    .eq("organization_id", organizationId)
    .order("next_billing_date", { ascending: true });

  if (!options.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getSubscriptions error:", error);
    return [];
  }

  return data as Subscription[];
}
