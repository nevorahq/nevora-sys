import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionsApplication, SubscriptionsRequestContext } from "@nevora/subscriptions-api";
import type { SubscriptionsRuntimeEffects } from "./effects";
import { createSubscriptionPaymentCycle, createSubscriptionPaymentTaskForCycle } from "./mutations";
import {
  getPaymentCycleByTaskId,
  getPaymentCycleByTransactionId,
  getSubscriptions,
} from "./queries";

export interface SubscriptionsRuntimeDependencies {
  supabase: SupabaseClient;
  context: Readonly<SubscriptionsRequestContext>;
  effects: SubscriptionsRuntimeEffects;
}

/** Supabase-backed implementation shared by the root adapter and a future standalone Subscriptions app. */
export function createSubscriptionsRuntimeApplication(
  dependencies: SubscriptionsRuntimeDependencies,
): SubscriptionsApplication {
  const { supabase, context, effects } = dependencies;
  return {
    context,
    getSubscriptions: () => getSubscriptions(supabase, context.organizationId),
    getPaymentCycleByTaskId: (taskId) =>
      getPaymentCycleByTaskId(supabase, context.organizationId, taskId),
    getPaymentCycleByTransactionId: (transactionId) =>
      getPaymentCycleByTransactionId(supabase, context.organizationId, transactionId),
    createSubscriptionPaymentCycle: (input) =>
      createSubscriptionPaymentCycle(supabase, context, effects, input),
    createSubscriptionPaymentTaskForCycle: (input) =>
      createSubscriptionPaymentTaskForCycle(supabase, context, effects, input),
  };
}
