/** Compatibility facade; canonical Subscriptions constants live in the workspace package. */
export {
  BILLING_CYCLES,
  SUB_CATEGORIES,
  SUB_NAME_MAX,
  SUB_NOTE_MAX,
  SUB_URL_MAX,
  ALERT_DAYS,
  CYCLE_TO_MONTHLY,
  CYCLE_TO_YEARLY,
} from "@nevora/subscriptions-contracts";
export type { BillingCycle, SubCategory, AlertDay } from "@nevora/subscriptions-contracts";
