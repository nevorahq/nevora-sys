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

export {
  commercialPlanCatalog,
  commercialPlans,
  commercialFeatureLabels,
  commercialUsageLabels,
  featureKeyToEntitlementKey,
  usageMetricToLimitKey,
  planKeyForSlug,
  nextCommercialPlanKey,
  formatCommercialLimit,
  assertCatalogConsistency,
} from "./plan-catalog";
export {
  commercialPlanKeys,
  commercialFeatureKeys,
  commercialUsageMetricKeys,
  commercialPlanKeySchema,
  commercialFeatureKeySchema,
  commercialUsageMetricKeySchema,
} from "./plan-catalog.schema";
export type {
  CommercialPlanKey,
  CommercialFeatureKey,
  CommercialUsageMetricKey,
} from "./plan-catalog.schema";
export type {
  ChangePlanInput, CancelSubscriptionInput,
  SetFeatureFlagInput, RecordUsageInput,
} from "./schemas/billing.schemas";

// Trial Reuse Protection (086)
export type {
  TrialEligibilityResult,
  TrialIneligibleReason,
  TrialClaim,
  TrialClaimStatus,
} from "./types/trial.types";
export { parseTrialEligibility } from "./services/trial-eligibility";
export { getTrialEligibility } from "./queries/get-trial-eligibility";
export { consumeExpiredTrials } from "./services/consume-expired-trials";
export type { ConsumeExpiredTrialsResult } from "./services/consume-expired-trials";

// Entitlement control plane (089): HMAC identity + typed access states
export type {
  EntitlementReason,
  OrgAccessState,
  TrialEligibility,
  ClaimTrialResult,
} from "./types/entitlement.types";
export {
  ORG_ACCESS_STATES,
  ENTITLEMENT_REASONS,
  WRITABLE_ACCESS_STATES,
} from "./types/entitlement.types";
export {
  parseTrialEligibilityV2,
  parseClaimTrialResult,
  parseAccessState,
  isWritableAccessState,
  isTrialAlreadyUsed,
} from "./services/entitlement";
export {
  getAccessStateView,
  isAccessIntentAllowed,
  blockedActionMessage,
  DEFAULT_BLOCKED_ACTION_MESSAGE,
  INVITE_BLOCKED_MESSAGE,
  AI_BLOCKED_MESSAGE,
  UPLOAD_BLOCKED_MESSAGE,
} from "./services/access-state-ui";
export type { AccessGateIntent, AccessStateView } from "./services/access-state-ui";
export { getOrganizationAccessState } from "./queries/get-organization-access-state";
export { getTrialEligibilityForCurrentUser } from "./queries/get-trial-eligibility-v2";
export { claimTrialForCurrentUser } from "./services/claim-trial";

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
export {
  BillingProviderNotConfiguredError,
  billingProvider,
  getConfiguredBillingProvider,
  parseBillingProvider,
} from "./services/billing-provider";
export { StripeBillingAdapter, stripePriceIdForPlan, verifyStripeWebhookSignature } from "./services/stripe.adapter";
export { billingRepository } from "./services/billing-repository";
export { entitlementService, canUseFeatureForOrganization } from "./services/entitlement-service";
export { usageService } from "./services/usage-service";
export { featureGateService } from "./services/feature-gate-service";
export { getUpgradePromptForUsage, getUpgradePromptsForUsage } from "./services/upgrade-prompt.service";
export { getPublicPlanViews } from "./public-plan-view";
export type { PublicPlanView } from "./public-plan-view";
export {
  getStripeConfig,
  getStripeConfigMissing,
  isStripeCheckoutAvailable,
  stripePriceIdForPlanFromConfig,
} from "./config/stripe-env";
export type { StripeConfig, StripeRuntimeMode } from "./config/stripe-env";
export type {
  BillingProvider,
  BillingProviderAdapter,
  BillingWebhookResult,
  CheckoutSession,
  CreateCheckoutInput,
  CustomerPortalInput,
  CustomerPortalSession,
  InternalBillingStatus,
  ProviderSubscriptionStatus,
} from "./services/billing-provider";
export type {
  AppliedBillingWebhookResult,
  NormalizedBillingWebhookEvent,
} from "./services/billing-webhook";

// Actions
export { createCheckoutSessionAction } from "./actions/create-checkout-session.action";
export type { CheckoutActionState } from "./actions/create-checkout-session.action";
export { changePlanAction }          from "./actions/change-plan.action";
export { cancelSubscriptionAction }  from "./actions/cancel-subscription.action";
export { initSubscriptionAction }    from "./actions/init-subscription.action";
