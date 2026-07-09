import "server-only";

import {
  applyBillingProviderEvent,
  parseBillingWebhookEvent,
  verifyBillingWebhookSignature,
} from "./billing-webhook";
import type {
  BillingProviderAdapter,
  BillingWebhookResult,
  CheckoutSession,
  CreateCheckoutInput,
  CustomerPortalInput,
  CustomerPortalSession,
} from "./billing-provider";
import {
  getPaddleConfig,
  isPaddleCheckoutAvailable,
  paddlePriceIdForPlanFromConfig,
  type PaddleConfig,
} from "../config/paddle-env";
import type { BillingCycle, PlanSlug } from "../constants/billing.constants";

export function paddlePriceIdForPlan(
  planCode: PlanSlug,
  billingCycle: BillingCycle,
): string | null {
  return paddlePriceIdForPlanFromConfig(getPaddleConfig(), planCode, billingCycle);
}

export class PaddleBillingAdapter implements BillingProviderAdapter {
  readonly provider = "paddle" as const;
  readonly configured: boolean;

  constructor(private readonly config: PaddleConfig = getPaddleConfig()) {
    this.configured = isPaddleCheckoutAvailable(config);
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const priceId = paddlePriceIdForPlanFromConfig(this.config, input.planCode, input.billingCycle);
    return {
      provider: this.provider,
      configured: this.configured && Boolean(priceId),
      url: null,
      reference: `paddle:checkout:${input.organizationId}:${input.planCode}:${input.billingCycle}`,
    };
  }

  async createCustomerPortal(_input: CustomerPortalInput): Promise<CustomerPortalSession> {
    return {
      provider: this.provider,
      configured: this.configured,
      url: null,
    };
  }

  async handleWebhook(
    rawBody: string,
    headers: globalThis.Headers,
  ): Promise<BillingWebhookResult> {
    const signature = headers.get("paddle-signature") ?? headers.get("billing-signature") ?? headers.get("x-billing-signature");

    if (!verifyBillingWebhookSignature(rawBody, signature, this.config.webhookSecret)) {
      return {
        accepted: false,
        eventType: null,
        ok: false,
        duplicate: false,
        ignoredReason: "invalid_signature",
      };
    }

    const event = parseBillingWebhookEvent(rawBody, this.provider);
    const result = await applyBillingProviderEvent(event);
    return {
      ...result,
      accepted: result.ok,
      eventType: event.eventType,
    };
  }
}
