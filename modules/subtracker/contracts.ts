/** Stable, runtime-safe public contracts for the Subscriptions product. */

export type { Subscription, SubSummary, UpcomingRenewal } from "./types/subtracker.types";
export type {
  SubscriptionPaymentCycle,
  SubscriptionForPayment,
} from "./types/payment-cycle.types";
export {
  PAYMENT_CYCLE_COLUMNS,
  SUBSCRIPTION_FOR_PAYMENT_COLUMNS,
} from "./types/payment-cycle.types";
export {
  BILLING_CYCLES,
  SUB_CATEGORIES,
  SUB_NAME_MAX,
  SUB_NOTE_MAX,
  SUB_URL_MAX,
  ALERT_DAYS,
  CYCLE_TO_MONTHLY,
  CYCLE_TO_YEARLY,
} from "./constants/subtracker.constants";
export type { BillingCycle, SubCategory, AlertDay } from "./constants/subtracker.constants";
export {
  PAYMENT_CYCLE_STATUSES,
  OPEN_CYCLE_STATUSES,
  AUTO_TRANSACTION_MODES,
} from "./constants/payment-cycle.constants";
export type { PaymentCycleStatus, AutoTransactionMode } from "./constants/payment-cycle.constants";
export { markSubscriptionPaymentSchema } from "./schemas/payment-cycle.schema";
export type { MarkSubscriptionPaymentInput } from "./schemas/payment-cycle.schema";
export { calculateNextPaymentDate, previousDay } from "./services/calculate-next-payment-date";
export { createBillingPeriodKey } from "./services/billing-period-key";
export {
  buildSubscriptionExpenseIdempotencyKey,
  buildSubscriptionExpenseTitle,
} from "./services/subscription-payment-keys";
