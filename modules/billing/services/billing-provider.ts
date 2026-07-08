import "server-only";

import type { BillingCycle, PlanSlug } from "../constants/billing.constants";
import {
  applyBillingProviderEvent,
  parseBillingWebhookEvent,
  verifyBillingWebhookSignature,
  type AppliedBillingWebhookResult,
} from "./billing-webhook";
import { StripeBillingAdapter } from "./stripe.adapter";

export type BillingProvider = "stripe" | "paddle" | "lemonsqueezy";

export type ProviderSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "paused"
  | "incomplete"
  | "incomplete_expired";

export type InternalBillingStatus =
  | "trialing"
  | "trial_expired"
  | "active"
  | "past_due"
  | "grace"
  | "unpaid"
  | "canceled"
  | "suspended"
  | "developer_unlimited";

export interface CreateCheckoutInput {
  organizationId: string;
  planCode: PlanSlug;
  billingCycle: BillingCycle;
  returnUrl: string;
}

export interface CheckoutSession {
  provider: BillingProvider | null;
  configured: boolean;
  url: string | null;
  reference: string;
}

export interface CustomerPortalInput {
  organizationId: string;
  returnUrl: string;
}

export interface CustomerPortalSession {
  provider: BillingProvider | null;
  configured: boolean;
  url: string | null;
}

export interface BillingWebhookResult extends AppliedBillingWebhookResult {
  accepted: boolean;
  eventType: string | null;
}

export interface BillingProviderAdapter {
  readonly provider: BillingProvider | null;
  readonly configured: boolean;
  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession>;
  createCustomerPortal(input: CustomerPortalInput): Promise<CustomerPortalSession>;
  handleWebhook(rawBody: string, headers: globalThis.Headers): Promise<BillingWebhookResult>;
}

export class BillingProviderNotConfiguredError extends Error {
  constructor(message = "Billing provider is not connected yet.") {
    super(message);
    this.name = "BillingProviderNotConfiguredError";
  }
}

class ProviderAgnosticBillingAdapter implements BillingProviderAdapter {
  readonly provider: BillingProvider | null;
  readonly configured: boolean;

  constructor(provider: BillingProvider | null) {
    this.provider = provider;
    this.configured = provider !== null;
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession> {
    return {
      provider: this.provider,
      configured: false,
      url: null,
      reference: `checkout:${input.organizationId}:${input.planCode}:${input.billingCycle}`,
    };
  }

  async createCustomerPortal(_input: CustomerPortalInput): Promise<CustomerPortalSession> {
    return {
      provider: this.provider,
      configured: false,
      url: null,
    };
  }

  async handleWebhook(
    rawBody: string,
    headers: globalThis.Headers,
  ): Promise<BillingWebhookResult> {
    const provider = this.provider;
    const secret = process.env.BILLING_WEBHOOK_SECRET;
    const signature = headers.get("billing-signature") ?? headers.get("x-billing-signature");

    if (!provider || !secret) {
      throw new BillingProviderNotConfiguredError(
        "Billing webhook is not configured. Set BILLING_PROVIDER and BILLING_WEBHOOK_SECRET.",
      );
    }

    if (!verifyBillingWebhookSignature(rawBody, signature, secret)) {
      return {
        accepted: false,
        eventType: null,
        ok: false,
        duplicate: false,
        ignoredReason: "invalid_signature",
      };
    }

    const event = parseBillingWebhookEvent(rawBody, provider);
    const result = await applyBillingProviderEvent(event);
    return {
      ...result,
      accepted: result.ok,
      eventType: event.eventType,
    };
  }
}

export function parseBillingProvider(value: string | undefined): BillingProvider | null {
  if (value === "stripe" || value === "paddle" || value === "lemonsqueezy") {
    return value;
  }
  return null;
}

export function getConfiguredBillingProvider(): BillingProviderAdapter {
  const provider = parseBillingProvider(process.env.BILLING_PROVIDER);
  if (provider === "stripe") return new StripeBillingAdapter();
  return new ProviderAgnosticBillingAdapter(provider);
}

export const billingProvider: BillingProviderAdapter = getConfiguredBillingProvider();
