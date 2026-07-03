export interface BillingErrorPayload {
  key: string;
  currentUsage: number;
  limit: number | null;
  planCode: string;
  message: string;
}

export class PlanLimitExceededError extends Error {
  readonly name = "PlanLimitExceededError";
  readonly payload: BillingErrorPayload;

  constructor(payload: BillingErrorPayload) {
    super(payload.message);
    this.payload = payload;
  }
}

export class PlanEntitlementRequiredError extends Error {
  readonly name = "PlanEntitlementRequiredError";
  readonly payload: BillingErrorPayload;

  constructor(payload: BillingErrorPayload) {
    super(payload.message);
    this.payload = payload;
  }
}

export class SubscriptionExpiredError extends Error {
  readonly name = "SubscriptionExpiredError";
  readonly payload: BillingErrorPayload;

  constructor(payload: BillingErrorPayload) {
    super(payload.message);
    this.payload = payload;
  }
}
