import "server-only";

import {
  applyBillingProviderEvent,
  isSupportedPaddleEventType,
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
import {
  PaddleApiError,
  createPaddlePortalSession,
  createPaddleTransactionCheckout,
} from "./paddle-api";
import { billingRepository } from "./billing-repository";
import { logger } from "@/lib/observability/logger";
import type { BillingCycle, PlanSlug } from "../constants/billing.constants";

export function paddlePriceIdForPlan(
  planCode: PlanSlug,
  billingCycle: BillingCycle,
): string | null {
  return paddlePriceIdForPlanFromConfig(getPaddleConfig(), planCode, billingCycle);
}

/**
 * Reads `event_type` off an already signature-verified body without committing
 * to the full schema, so an event we do not handle can be acknowledged instead
 * of failing schema validation and being retried forever.
 */
function readEventType(rawBody: string): string | null {
  try {
    const parsed = JSON.parse(rawBody) as { event_type?: unknown };
    return typeof parsed.event_type === "string" ? parsed.event_type : null;
  } catch {
    return null;
  }
}

export class PaddleBillingAdapter implements BillingProviderAdapter {
  readonly provider = "paddle" as const;
  readonly configured: boolean;

  constructor(private readonly config: PaddleConfig = getPaddleConfig()) {
    this.configured = isPaddleCheckoutAvailable(config);
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const priceId = paddlePriceIdForPlanFromConfig(this.config, input.planCode, input.billingCycle);
    const reference = `paddle:checkout:${input.organizationId}:${input.planCode}:${input.billingCycle}`;

    // No price id for this plan/cycle means Paddle is not configured for it.
    // Return url:null; the caller turns that into an honest "not connected".
    if (!this.configured || !priceId) {
      return { provider: this.provider, configured: false, url: null, reference };
    }

    const customerId = await billingRepository.getProviderCustomerId(
      input.organizationId,
      this.provider,
    );

    try {
      const { url } = await createPaddleTransactionCheckout(this.config, {
        priceId,
        organizationId: input.organizationId,
        actorId: input.actorId,
        customerId,
      });
      return { provider: this.provider, configured: true, url, reference };
    } catch (err) {
      // A missing default payment link is a configuration gap, not a crash: the
      // account owner has to set it in the dashboard. Surface it as url:null so
      // the user sees "not connected yet", not a 500.
      if (
        err instanceof PaddleApiError &&
        err.code === "transaction_default_checkout_url_not_set"
      ) {
        logger.warn("billing.checkout.no_default_payment_link", { organizationId: input.organizationId });
        return { provider: this.provider, configured: true, url: null, reference };
      }
      logger.error("billing.checkout.failed", {
        organizationId: input.organizationId,
        status: err instanceof PaddleApiError ? err.status : null,
        code: err instanceof PaddleApiError ? err.code : "unknown",
      });
      throw err;
    }
  }

  async createCustomerPortal(input: CustomerPortalInput): Promise<CustomerPortalSession> {
    if (!this.configured) {
      return { provider: this.provider, configured: false, url: null };
    }

    const customerId = await billingRepository.getProviderCustomerId(
      input.organizationId,
      this.provider,
    );
    // No customer on file means the org never checked out. There is no portal to
    // open; the caller renders an honest "not connected".
    if (!customerId) {
      return { provider: this.provider, configured: true, url: null };
    }

    const subscriptionId = await billingRepository.getProviderSubscriptionId(input.organizationId);

    try {
      const { url } = await createPaddlePortalSession(this.config, {
        customerId,
        subscriptionIds: subscriptionId ? [subscriptionId] : undefined,
      });
      return { provider: this.provider, configured: true, url };
    } catch (err) {
      logger.error("billing.portal.failed", {
        organizationId: input.organizationId,
        status: err instanceof PaddleApiError ? err.status : null,
        code: err instanceof PaddleApiError ? err.code : "unknown",
      });
      throw err;
    }
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

    // Paddle delivers every event type the notification setting subscribes to.
    // A signed event we do not act on must be *accepted* (HTTP 200) and ignored
    // — refusing it would make Paddle retry it until the destination is
    // deactivated.
    const eventType = readEventType(rawBody);
    if (eventType && !isSupportedPaddleEventType(eventType)) {
      return {
        accepted: true,
        eventType,
        ok: false,
        duplicate: false,
        ignoredReason: "unsupported_event_type",
      };
    }

    const event = parseBillingWebhookEvent(rawBody, this.provider, this.config);
    const result = await applyBillingProviderEvent(event);
    return {
      ...result,
      accepted: result.ok,
      eventType: event.eventType,
    };
  }
}
