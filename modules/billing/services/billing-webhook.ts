import "server-only";

import crypto from "node:crypto";
import { z } from "zod";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import type { BillingCycle, PlanSlug } from "../constants/billing.constants";
import { BILLING_CYCLES, PLAN_SLUGS } from "../constants/billing.constants";
import type {
  BillingProvider,
  InternalBillingStatus,
  ProviderSubscriptionStatus,
} from "./billing-provider";

const providerEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  created: z.union([z.number(), z.string()]).optional(),
  data: z.object({
    customerId: z.string().min(1).optional(),
    customer_id: z.string().min(1).optional(),
    subscriptionId: z.string().min(1).optional(),
    subscription_id: z.string().min(1).optional(),
    organizationId: z.string().uuid().optional(),
    organization_id: z.string().uuid().optional(),
    planCode: z.enum(PLAN_SLUGS).optional(),
    plan_slug: z.enum(PLAN_SLUGS).optional(),
    billingCycle: z.enum(BILLING_CYCLES).optional(),
    billing_cycle: z.enum(BILLING_CYCLES).optional(),
    currentPeriodStart: z.union([z.number(), z.string()]).optional(),
    current_period_start: z.union([z.number(), z.string()]).optional(),
    currentPeriodEnd: z.union([z.number(), z.string()]).optional(),
    current_period_end: z.union([z.number(), z.string()]).optional(),
    trialStart: z.union([z.number(), z.string()]).nullable().optional(),
    trial_start: z.union([z.number(), z.string()]).nullable().optional(),
    trialEnd: z.union([z.number(), z.string()]).nullable().optional(),
    trial_end: z.union([z.number(), z.string()]).nullable().optional(),
    cancelAtPeriodEnd: z.boolean().optional(),
    cancel_at_period_end: z.boolean().optional(),
    status: z
      .enum([
        "trialing",
        "active",
        "past_due",
        "unpaid",
        "canceled",
        "paused",
        "incomplete",
        "incomplete_expired",
      ])
      .optional(),
    internalStatus: z
      .enum([
        "trialing",
        "trial_expired",
        "active",
        "past_due",
        "grace",
        "unpaid",
        "canceled",
        "suspended",
      ])
      .optional(),
    internal_status: z
      .enum([
        "trialing",
        "trial_expired",
        "active",
        "past_due",
        "grace",
        "unpaid",
        "canceled",
        "suspended",
      ])
      .optional(),
  }),
});

export interface NormalizedBillingWebhookEvent {
  provider: BillingProvider;
  providerEventId: string;
  eventType: string;
  eventCreatedAt: string;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  organizationId: string | null;
  planSlug: Exclude<PlanSlug, "trial"> | null;
  billingCycle: BillingCycle | null;
  internalStatus: Exclude<InternalBillingStatus, "developer_unlimited">;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  payload: Record<string, unknown>;
}

export interface AppliedBillingWebhookResult {
  ok: boolean;
  duplicate: boolean;
  organizationId?: string | null;
  subscriptionId?: string | null;
  ignoredReason?: string;
}

function normalizeCreatedAt(value: number | string | undefined): string {
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  if (typeof value === "string") {
    const numeric = Number(value);
    const parsed = Number.isFinite(numeric) ? new Date(numeric * 1000) : new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

export function normalizeProviderTimestamp(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return new Date(value * 1000).toISOString();
  const numeric = Number(value);
  const parsed = Number.isFinite(numeric) ? new Date(numeric * 1000) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function providerStatusToInternal(
  status: ProviderSubscriptionStatus | undefined,
): Exclude<InternalBillingStatus, "developer_unlimited"> {
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
      return "past_due";
  }
}

/**
 * HMAC-SHA256 verification (timestamped `t=…,v1=…` header, 5-minute replay
 * window, constant-time compare). Paddle-specific webhook verification is
 * completed in the provider implementation layer.
 */
export function verifyBillingWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  now = Date.now(),
): boolean {
  if (!header || !secret) return false;

  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  const timestamp = parts.t;
  const provided = parts.v1;
  // Require an explicit `t=` timestamp and `v1=` signature — no timestamp-less
  // fallback. Every accepted event is therefore bound to the replay window, and
  // a captured signature cannot be stripped of its timestamp to bypass it.
  if (!timestamp || !provided || !/^[a-f0-9]{64}$/i.test(provided)) return false;

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 5 * 60 * 1000) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  const providedBuffer = Buffer.from(provided, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return (
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export function parseBillingWebhookEvent(
  rawBody: string,
  provider: BillingProvider,
): NormalizedBillingWebhookEvent {
  const json = JSON.parse(rawBody) as unknown;
  const parsed = providerEventSchema.parse(json);
  const data = parsed.data;
  const planSlug = data.planCode ?? data.plan_slug ?? null;
  const internalStatus =
    data.internalStatus ??
    data.internal_status ??
    providerStatusToInternal(data.status as ProviderSubscriptionStatus | undefined);

  if (planSlug === "trial") {
    throw new Error("Provider webhook cannot activate the trial plan.");
  }

  return {
    provider,
    providerEventId: parsed.id,
    eventType: parsed.type,
    eventCreatedAt: normalizeCreatedAt(parsed.created),
    providerCustomerId: data.customerId ?? data.customer_id ?? null,
    providerSubscriptionId: data.subscriptionId ?? data.subscription_id ?? null,
    organizationId: data.organizationId ?? data.organization_id ?? null,
    planSlug: (planSlug as Exclude<PlanSlug, "trial"> | null) ?? null,
    billingCycle: data.billingCycle ?? data.billing_cycle ?? null,
    internalStatus,
    currentPeriodStart: normalizeProviderTimestamp(data.currentPeriodStart ?? data.current_period_start),
    currentPeriodEnd: normalizeProviderTimestamp(data.currentPeriodEnd ?? data.current_period_end),
    trialStart: normalizeProviderTimestamp(data.trialStart ?? data.trial_start),
    trialEnd: normalizeProviderTimestamp(data.trialEnd ?? data.trial_end),
    cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? data.cancel_at_period_end ?? null,
    payload: {
      source: "billing_provider_webhook",
      event_type: parsed.type,
      provider_status: data.status ?? null,
      internal_status: internalStatus,
      current_period_start: normalizeProviderTimestamp(data.currentPeriodStart ?? data.current_period_start),
      current_period_end: normalizeProviderTimestamp(data.currentPeriodEnd ?? data.current_period_end),
      trial_start: normalizeProviderTimestamp(data.trialStart ?? data.trial_start),
      trial_end: normalizeProviderTimestamp(data.trialEnd ?? data.trial_end),
      cancel_at_period_end: data.cancelAtPeriodEnd ?? data.cancel_at_period_end ?? null,
    },
  };
}

function readRpcResult(value: unknown): AppliedBillingWebhookResult {
  const result = (value ?? {}) as Record<string, unknown>;
  return {
    ok: result.ok === true,
    duplicate: result.duplicate === true,
    organizationId: typeof result.organization_id === "string" ? result.organization_id : null,
    subscriptionId: typeof result.subscription_id === "string" ? result.subscription_id : null,
    ignoredReason:
      typeof result.ignored_reason === "string" ? result.ignored_reason : undefined,
  };
}

export async function applyBillingProviderEvent(
  event: NormalizedBillingWebhookEvent,
): Promise<AppliedBillingWebhookResult> {
  const supabase = getServiceRoleClient();
  if (!supabase) {
    return { ok: false, duplicate: false, ignoredReason: "service_role_not_configured" };
  }

  const { data, error } = await supabase.rpc("apply_billing_provider_event", {
    p_provider: event.provider,
    p_provider_event_id: event.providerEventId,
    p_event_type: event.eventType,
    p_event_created_at: event.eventCreatedAt,
    p_provider_customer_id: event.providerCustomerId,
    p_provider_subscription_id: event.providerSubscriptionId,
    p_organization_id: event.organizationId,
    p_plan_slug: event.planSlug,
    p_billing_cycle: event.billingCycle,
    p_internal_status: event.internalStatus,
    p_payload: event.payload,
  });

  if (error) {
    return { ok: false, duplicate: false, ignoredReason: error.code ?? "rpc_error" };
  }

  return readRpcResult(data);
}
