import "server-only";

import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";

export interface ConsumeExpiredTrialsResult {
  ok: boolean;
  configured: boolean;
  expiredSubscriptions: number;
  consumedClaims: number;
}

/**
 * Cron-sweep жизненного цикла trial (migration 086).
 *
 * Вызывает RPC consume_expired_trials(): просроченные trialing-подписки
 * становятся expired, их billing_trial_claims — consumed, события
 * billing.trial.consumed / billing.plan.required пишутся в domain_events
 * внутри той же транзакции БД.
 *
 * Cross-org, поэтому service-role клиент — тот же established-паттерн, что
 * extraction / suggestions / subscription sweeps (только crons, не
 * application logic). Идемпотентно: повторный вызов ничего не дублирует.
 */
export async function consumeExpiredTrials(): Promise<ConsumeExpiredTrialsResult> {
  const log = logger.child({ scope: "trial_sweep" });
  const supabase = getServiceRoleClient();
  if (!supabase) {
    log.warn("skipped.no_service_role");
    return { ok: false, configured: false, expiredSubscriptions: 0, consumedClaims: 0 };
  }

  const { data, error } = await supabase.rpc("consume_expired_trials");

  if (error) {
    log.error("failed", { error: error.message });
    return { ok: false, configured: true, expiredSubscriptions: 0, consumedClaims: 0 };
  }

  const result = (data ?? {}) as { expired_subscriptions?: number; consumed_claims?: number };
  const expiredSubscriptions = Number(result.expired_subscriptions ?? 0);
  const consumedClaims = Number(result.consumed_claims ?? 0);

  if (expiredSubscriptions > 0 || consumedClaims > 0) {
    log.info("swept", { expiredSubscriptions, consumedClaims });
  }

  return { ok: true, configured: true, expiredSubscriptions, consumedClaims };
}
