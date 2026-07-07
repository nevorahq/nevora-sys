import type { TrialEligibilityResult, TrialIneligibleReason } from "../types/trial.types";

const INELIGIBLE_REASONS: readonly TrialIneligibleReason[] = [
  "trial_active",
  "trial_consumed",
  "trial_blocked",
  "billing_identity_already_used",
];

/**
 * Приводит сырой JSONB-ответ RPC check_trial_eligibility() к типизированному
 * контракту. Fail-closed: любой неожиданный/битый ответ трактуется как
 * «trial недоступен» — выдать trial по ошибке хуже, чем показать платные
 * планы (реальный enforcement всё равно в БД, это только UX-слой).
 */
export function parseTrialEligibility(raw: unknown): TrialEligibilityResult {
  if (raw && typeof raw === "object") {
    const { eligible, reason } = raw as { eligible?: unknown; reason?: unknown };

    if (eligible === true && reason === "never_used") {
      return { eligible: true, reason: "never_used" };
    }

    if (eligible === false && INELIGIBLE_REASONS.includes(reason as TrialIneligibleReason)) {
      return { eligible: false, reason: reason as TrialIneligibleReason };
    }
  }

  return { eligible: false, reason: "trial_blocked" };
}
