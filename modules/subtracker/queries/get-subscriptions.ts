import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Subscription } from "../types/subtracker.types";

/**
 * Query: получить все подписки пользователя.
 *
 * По умолчанию только активные. Сортировка по next_billing_date —
 * ближайшие списания наверху.
 */
export async function getSubscriptions(
  options: { includeInactive?: boolean } = {},
): Promise<Subscription[]> {
  const supabase = await createClient();

  let query = supabase
    .from("subscriptions")
    .select("*")
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
