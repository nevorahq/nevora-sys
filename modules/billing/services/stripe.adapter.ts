import "server-only";

import crypto from "node:crypto";
import type { BillingCycle, PlanSlug } from "../constants/billing.constants";
import type {
  BillingProviderAdapter,
  BillingWebhookResult,
  CheckoutSession,
  CreateCheckoutInput,
  CustomerPortalInput,
  CustomerPortalSession,
  InternalBillingStatus,
  ProviderSubscriptionStatus,
} from "./billing-provider";
import {
  applyBillingProviderEvent,
  normalizeProviderTimestamp,
  type NormalizedBillingWebhookEvent,
} from "./billing-webhook";
import { billingRepository } from "./billing-repository";
import {
  getStripeConfig,
  stripePriceIdForPlanFromConfig,
  type StripeConfig,
} from "../config/stripe-env";

type StripeEvent = {
  id: string;
  type: string;
  created?: number;
  data: { object: Record<string, unknown> };
};

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

export function stripePriceIdForPlan(
  planCode: PlanSlug,
  billingCycle: BillingCycle,
): string | null {
  return stripePriceIdForPlanFromConfig(getStripeConfig(), planCode, billingCycle);
}

function planForStripePrice(priceId: string | null | undefined): Exclude<PlanSlug, "trial"> | null {
  if (!priceId) return null;
  const entries: Array<[Exclude<PlanSlug, "trial">, BillingCycle]> = [
    ["start", "monthly"],
    ["start", "yearly"],
    ["pro", "monthly"],
    ["pro", "yearly"],
    ["business", "monthly"],
    ["business", "yearly"],
  ];
  for (const [planCode, billingCycle] of entries) {
    if (stripePriceIdForPlan(planCode, billingCycle) === priceId) return planCode;
  }
  return null;
}

function cycleForStripePrice(priceId: string | null | undefined): BillingCycle | null {
  if (!priceId) return null;
  for (const cycle of ["monthly", "yearly"] as const) {
    if (
      stripePriceIdForPlan("start", cycle) === priceId ||
      stripePriceIdForPlan("pro", cycle) === priceId ||
      stripePriceIdForPlan("business", cycle) === priceId
    ) {
      return cycle;
    }
  }
  return null;
}

function encodeForm(data: Record<string, string | number | boolean | null | undefined>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && value !== undefined) body.set(key, String(value));
  }
  return body;
}

async function stripePost<T>(
  path: string,
  body: URLSearchParams,
  secretKey: string,
  idempotencyKey?: string,
): Promise<T> {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body,
  });
  const json = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(json.error?.message ?? `Stripe request failed with ${response.status}.`);
  }
  return json;
}

export function verifyStripeWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined | null,
  now = Date.now(),
): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").reduce<Record<string, string[]>>((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = [...(acc[key] ?? []), rest.join("=")];
    return acc;
  }, {});

  const timestamp = Number(parts.t?.[0]);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(now - timestamp * 1000) > STRIPE_SIGNATURE_TOLERANCE_MS) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return (parts.v1 ?? []).some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const providedBuffer = Buffer.from(signature, "hex");
    return (
      providedBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    );
  });
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function firstSubscriptionItemPriceId(object: Record<string, unknown>): string | null {
  const items = object.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
  return items?.data?.[0]?.price?.id ?? null;
}

function metadataValue(
  object: Record<string, unknown>,
  key: string,
): string | null {
  const metadata = object.metadata as Record<string, unknown> | undefined;
  return stringValue(metadata?.[key]);
}

function providerStatusToInternal(
  status: ProviderSubscriptionStatus | undefined,
  eventType: string,
): Exclude<InternalBillingStatus, "developer_unlimited"> {
  if (eventType === "invoice.payment_failed") return "past_due";
  if (eventType === "customer.subscription.deleted") return "canceled";
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "incomplete":
      return "past_due";
    case "unpaid":
      return "unpaid";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "paused":
      return "suspended";
    default:
      return eventType === "checkout.session.completed" ? "active" : "past_due";
  }
}

function normalizeStripeEvent(event: StripeEvent): NormalizedBillingWebhookEvent {
  const object = event.data.object;
  const eventType = event.type;
  const isCheckout = eventType === "checkout.session.completed";
  const isInvoice = eventType.startsWith("invoice.");
  const priceId = firstSubscriptionItemPriceId(object);
  const metadataPlan = metadataValue(object, "plan_code") ?? metadataValue(object, "planSlug");
  const planSlug = (metadataPlan as Exclude<PlanSlug, "trial"> | null) ?? planForStripePrice(priceId);
  const metadataCycle = metadataValue(object, "billing_cycle") ?? metadataValue(object, "billingCycle");
  const billingCycle = (metadataCycle as BillingCycle | null) ?? cycleForStripePrice(priceId);
  const providerStatus = stringValue(object.status) as ProviderSubscriptionStatus | null;
  const subscriptionId = isCheckout || isInvoice
    ? stringValue(object.subscription)
    : stringValue(object.id);
  const customerId = stringValue(object.customer);
  const currentPeriodStart = normalizeProviderTimestamp(object.current_period_start as number | string | null | undefined);
  const currentPeriodEnd = normalizeProviderTimestamp(object.current_period_end as number | string | null | undefined);
  const trialStart = normalizeProviderTimestamp(object.trial_start as number | string | null | undefined);
  const trialEnd = normalizeProviderTimestamp(object.trial_end as number | string | null | undefined);
  const cancelAtPeriodEnd = booleanValue(object.cancel_at_period_end);

  return {
    provider: "stripe",
    providerEventId: event.id,
    eventType,
    eventCreatedAt: normalizeProviderTimestamp(event.created) ?? new Date().toISOString(),
    providerCustomerId: customerId,
    providerSubscriptionId: subscriptionId,
    organizationId:
      metadataValue(object, "organization_id") ??
      metadataValue(object, "organizationId") ??
      stringValue(object.client_reference_id),
    planSlug,
    billingCycle,
    internalStatus: providerStatusToInternal(providerStatus ?? undefined, eventType),
    currentPeriodStart,
    currentPeriodEnd,
    trialStart,
    trialEnd,
    cancelAtPeriodEnd,
    payload: {
      source: "stripe_webhook",
      event_type: eventType,
      provider_status: providerStatus,
      internal_status: providerStatusToInternal(providerStatus ?? undefined, eventType),
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      trial_start: trialStart,
      trial_end: trialEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      price_id: priceId,
    },
  };
}

export class StripeBillingAdapter implements BillingProviderAdapter {
  readonly provider = "stripe" as const;
  readonly configured: boolean;
  private readonly config: StripeConfig;

  constructor(config = getStripeConfig()) {
    this.config = config;
    this.configured = config.mode === "stripe" && Boolean(config.secretKey);
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const secretKey = this.config.secretKey;
    const priceId = stripePriceIdForPlanFromConfig(this.config, input.planCode, input.billingCycle);
    if (this.config.mode !== "stripe" || !secretKey || !priceId) {
      return {
        provider: this.provider,
        configured: false,
        url: null,
        reference: `stripe:checkout:${input.organizationId}:${input.planCode}:${input.billingCycle}`,
      };
    }

    const existingCustomerId = await billingRepository.getProviderCustomerId(
      input.organizationId,
      this.provider,
    );
    const body = encodeForm({
      mode: "subscription",
      client_reference_id: input.organizationId,
      success_url: `${input.returnUrl}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${input.returnUrl}?checkout=cancelled`,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": 1,
      allow_promotion_codes: true,
      customer: existingCustomerId,
      customer_creation: existingCustomerId ? null : "always",
      "metadata[organization_id]": input.organizationId,
      "metadata[plan_code]": input.planCode,
      "metadata[billing_cycle]": input.billingCycle,
      "metadata[actor_id]": input.actorId,
      "subscription_data[metadata][organization_id]": input.organizationId,
      "subscription_data[metadata][plan_code]": input.planCode,
      "subscription_data[metadata][billing_cycle]": input.billingCycle,
      "subscription_data[metadata][actor_id]": input.actorId,
    });

    const idempotencyKey = [
      "checkout",
      input.organizationId,
      input.actorId,
      input.planCode,
      input.billingCycle,
    ].join(":");

    const session = await stripePost<{ id: string; url: string | null }>(
      "/checkout/sessions",
      body,
      secretKey,
      idempotencyKey,
    );

    return {
      provider: this.provider,
      configured: true,
      url: session.url,
      reference: session.id,
    };
  }

  async createCustomerPortal(input: CustomerPortalInput): Promise<CustomerPortalSession> {
    const secretKey = this.config.secretKey;
    const customerId = await billingRepository.getProviderCustomerId(input.organizationId, this.provider);
    if (this.config.mode !== "stripe" || !secretKey || !customerId) {
      return { provider: this.provider, configured: false, url: null };
    }

    const session = await stripePost<{ url: string | null }>(
      "/billing_portal/sessions",
      encodeForm({ customer: customerId, return_url: input.returnUrl }),
      secretKey,
    );

    return { provider: this.provider, configured: true, url: session.url };
  }

  async handleWebhook(
    rawBody: string,
    headers: globalThis.Headers,
  ): Promise<BillingWebhookResult> {
    const webhookSecret = this.config.webhookSecret;
    const signature = headers.get("stripe-signature");
    if (!verifyStripeWebhookSignature(rawBody, signature, webhookSecret)) {
      return {
        accepted: false,
        eventType: null,
        ok: false,
        duplicate: false,
        ignoredReason: "invalid_signature",
      };
    }

    const event = JSON.parse(rawBody) as StripeEvent;
    const normalized = normalizeStripeEvent(event);
    const result = await applyBillingProviderEvent(normalized);
    return {
      ...result,
      accepted: result.ok,
      eventType: normalized.eventType,
    };
  }
}
