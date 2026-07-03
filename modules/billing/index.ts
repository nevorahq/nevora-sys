// Types
export type {
  Plan,
  Subscription,
  SubscriptionWithPlan,
  FeatureFlag,
  UsageRecord,
  Invoice,
  UsageSummary,
  BillingOverview,
} from "./types/billing.types";

// Constants
export {
  PLAN_SLUGS, SUBSCRIPTION_STATUSES, BILLING_CYCLES,
  USAGE_METRICS, INVOICE_STATUSES,
  PLAN_LABELS, SUBSCRIPTION_STATUS_STYLES, INVOICE_STATUS_STYLES,
  USAGE_METRIC_LABELS, UNLIMITED,
} from "./constants/billing.constants";
export type {
  PlanSlug, SubscriptionStatus, BillingCycle,
  UsageMetric, InvoiceStatus,
} from "./constants/billing.constants";

// Schemas
export {
  changePlanSchema, cancelSubscriptionSchema,
  setFeatureFlagSchema, recordUsageSchema,
} from "./schemas/billing.schemas";
export type {
  ChangePlanInput, CancelSubscriptionInput,
  SetFeatureFlagInput, RecordUsageInput,
} from "./schemas/billing.schemas";

// Queries
export { getSubscription }  from "./queries/get-subscription";
export { getPlans }         from "./queries/get-plans";
export { getUsageSummary }  from "./queries/get-usage";
export { getInvoices }      from "./queries/get-invoices";
export { getTrialState }    from "./queries/get-trial-state";
export type { TrialState }  from "./queries/get-trial-state";

// Services
export {
  getOrganizationPlan,
  getOrganizationSubscription,
  getPlanEntitlement,
  getPlanLimit,
  getUsage,
  assertPlanEntitlement,
  assertPlanLimit,
  incrementUsage,
  reserveOrganizationUsage,
  releaseOrganizationUsage,
  decrementUsage,
  recalculateOrganizationUsage,
  assertSubscriptionWritable,
} from "./services/billing-service";
export type { PlanLimit, UsageValue } from "./services/billing-service";
export {
  BILLING_LIMIT_KEYS,
  BILLING_ENTITLEMENT_KEYS,
  currentPeriodWindow,
  defaultPeriodForLimit,
  legacyPlanLimit,
  megabytesToBytes,
} from "./services/usage-keys";
export { isSubscriptionWritableState } from "./services/subscription-writability";
export type { SubscriptionWritableState } from "./services/subscription-writability";
export type {
  BillingLimitKey,
  BillingEntitlementKey,
  LimitPeriod,
} from "./services/usage-keys";
export {
  PlanLimitExceededError,
  PlanEntitlementRequiredError,
  SubscriptionExpiredError,
} from "./errors/billing.errors";
export type { BillingErrorPayload } from "./errors/billing.errors";
export { ManualBillingProvider, billingProvider } from "./services/billing-provider";
export type {
  BillingProvider,
  BillingWebhookResult,
  CheckoutSession,
  CreateCheckoutInput,
  CustomerPortalInput,
  CustomerPortalSession,
} from "./services/billing-provider";

// Actions
export { changePlanAction }          from "./actions/change-plan.action";
export { cancelSubscriptionAction }  from "./actions/cancel-subscription.action";
export { initSubscriptionAction }    from "./actions/init-subscription.action";
