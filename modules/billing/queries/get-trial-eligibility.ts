import "server-only";

import { createClient } from "@/lib/supabase/server";
import { parseTrialEligibility } from "../services/trial-eligibility";
import type { TrialEligibilityResult } from "../types/trial.types";

/**
 * Trial eligibility текущего пользователя (RPC check_trial_eligibility,
 * migration 086). Identity берётся из auth.uid() на стороне БД — никакого
 * client payload. UX-запрос: даже если UI покажет не ту кнопку, повторный
 * trial всё равно невозможен (unique-констрейнты billing_trial_claims).
 *
 * Транспортная ошибка RPC (миграция ещё не применена, сеть) → считаем
 * eligible: это чисто UX-сигнал, и ложное «trial уже использован» для
 * нового пользователя хуже, чем скрытая подсказка — БД всё равно не выдаст
 * повторный trial. Битый же payload успешного вызова парсится fail-closed.
 */
export async function getTrialEligibility(): Promise<TrialEligibilityResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("check_trial_eligibility");

  if (error) {
    console.error("getTrialEligibility RPC error:", error.message);
    return { eligible: true, reason: "never_used" };
  }

  return parseTrialEligibility(data);
}
