import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  CYCLE_TO_MONTHLY,
  CYCLE_TO_YEARLY,
  type BillingCycle,
} from "../constants/subtracker.constants";
import type { SubSummary } from "../types/subtracker.types";

/**
 * Query: агрегированное summary по подпискам.
 *
 * Считает:
 * - activeCount: сколько активных подписок
 * - monthlyCost: приведённая месячная стоимость всех подписок
 * - yearlyCost: приведённая годовая стоимость всех подписок
 *
 * Приведение через множители:
 *   Weekly $2.99 → monthly: 2.99 × 4.33 = $12.95
 *   Yearly $99   → monthly: 99 / 12 = $8.25
 *
 * RLS (is_org_member) допускает любую org пользователя — при active
 * membership в нескольких сразу (multi-org, Phase 4.3) явный фильтр по
 * organizationId обязателен поверх RLS.
 */
export async function getSubSummary(organizationId: string): Promise<SubSummary> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("amount, billing_cycle")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (error) {
    console.error("getSubSummary error:", error);
    return { activeCount: 0, monthlyCost: 0, yearlyCost: 0 };
  }

  const subs = data ?? [];
  let monthlyCost = 0;
  let yearlyCost = 0;

  for (const sub of subs) {
    const amount = Number(sub.amount);
    const cycle = sub.billing_cycle as BillingCycle;
    monthlyCost += amount * CYCLE_TO_MONTHLY[cycle];
    yearlyCost += amount * CYCLE_TO_YEARLY[cycle];
  }

  return {
    activeCount: subs.length,
    monthlyCost: Math.round(monthlyCost * 100) / 100,
    yearlyCost: Math.round(yearlyCost * 100) / 100,
  };
}
