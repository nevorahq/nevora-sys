import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { createSubscriptionPaymentCycle } from "./create-subscription-payment-cycle";
import { createSubscriptionPaymentTaskForCycle } from "./create-subscription-payment-task";
import type { SubscriptionForPayment, SubscriptionPaymentCycle } from "../types/payment-cycle.types";

type Result =
  | { ok: true; cycle: SubscriptionPaymentCycle; taskId: string | null }
  | { ok: false; error: string };

/**
 * Ensure a subscription has an open payment cycle (planned) with its payment
 * task (task_open) for the given due date. Idempotent and money-free.
 *
 * Task creation is non-fatal: a cycle without a task is a valid, repairable
 * state (the safety cron adopts it), so we never fail the whole operation just
 * because the todo insert failed.
 */
export async function provisionSubscriptionPaymentCycle(params: {
  supabase: SupabaseClient;
  ctx: CurrentContext;
  subscription: SubscriptionForPayment;
  dueDate: string;
}): Promise<Result> {
  const { supabase, ctx, subscription, dueDate } = params;

  const cycleRes = await createSubscriptionPaymentCycle({ supabase, ctx, subscription, dueDate });
  if (!cycleRes.ok) return cycleRes;

  const taskRes = await createSubscriptionPaymentTaskForCycle({
    supabase,
    ctx,
    subscription,
    cycle: cycleRes.cycle,
  });

  return {
    ok: true,
    cycle: cycleRes.cycle,
    taskId: taskRes.ok ? taskRes.taskId || null : null,
  };
}
