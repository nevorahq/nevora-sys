import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Subscription, UpcomingRenewal } from "../types/subtracker.types";

/**
 * Query: подписки с ближайшими списаниями (0-7 дней).
 *
 * Возвращает подписки с полем daysUntil — сколько дней до списания.
 * Используется для:
 * - UI-баннеров на dashboard ("Netflix через 3 дня")
 * - Цветовой индикации (5 дней = жёлтый, 3 = оранжевый, 1 = красный)
 * - Badge в sidebar (количество upcoming)
 *
 * Сортировка: самые срочные наверху (daysUntil ASC).
 *
 * RLS (is_org_member) допускает любую org пользователя — при active
 * membership в нескольких сразу (multi-org, Phase 4.3) явный фильтр по
 * organizationId обязателен поверх RLS.
 */
export async function getUpcomingRenewals(organizationId: string): Promise<UpcomingRenewal[]> {
  const supabase = await createClient();

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // +7 дней от сегодня
  const weekLater = new Date(today);
  weekLater.setDate(weekLater.getDate() + 7);
  const weekLaterStr = weekLater.toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .gte("next_billing_date", todayStr)
    .lte("next_billing_date", weekLaterStr)
    .order("next_billing_date", { ascending: true });

  if (error) {
    console.error("getUpcomingRenewals error:", error);
    return [];
  }

  const subs = (data ?? []) as Subscription[];

  return subs.map((sub) => {
    const billingDate = new Date(sub.next_billing_date + "T00:00:00");
    const todayMidnight = new Date(todayStr + "T00:00:00");
    const diffMs = billingDate.getTime() - todayMidnight.getTime();
    const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));

    return { ...sub, daysUntil };
  });
}
