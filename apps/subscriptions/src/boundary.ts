import type { SubscriptionsApplication } from "@nevora/subscriptions-api";

/** Current readiness of this separately extractable application. */
export const SUBSCRIPTIONS_EXTRACTION_STAGE = "standalone_runtime_ready" as const;

/**
 * Stable transport contract implemented by the standalone Subscriptions runtime.
 */
export type SubscriptionsApplicationBoundary = SubscriptionsApplication;
