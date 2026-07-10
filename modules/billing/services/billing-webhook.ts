import "server-only";

import crypto from "node:crypto";
import { z } from "zod";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import type { BillingCycle, PlanSlug } from "../constants/billing.constants";
import {
  getPaddleConfig,
  planForPaddlePriceIdFromConfig,
  type PaddleConfig,
} from "../config/paddle-env";
import type {
  BillingProvider,
  InternalBillingStatus,
  ProviderSubscriptionStatus,
} from "./billing-provider";

/**
 * Paddle's webhook envelope. Every event carries the same top level:
 * `event_id`, `event_type`, `occurred_at`, `notification_id`, `data`.
 *
 * `data` here is typed for subscription events only — those are the events that
 * move an organization's plan. Everything else is refused before parsing, so it
 * never reaches this schema.
 *
 * @see https://developer.paddle.com/webhooks/about/how-webhooks-work
 */
const paddleSubscriptionEventSchema = z.object({
  event_id: z.string().min(1),
  event_type: z.string().min(1),
  occurred_at: z.string().min(1).optional(),
  notification_id: z.string().min(1).optional(),
  data: z.object({
    id: z.string().min(1).optional(),
    customer_id: z.string().min(1).optional(),
    status: z.enum(["trialing", "active", "past_due", "canceled", "paused"]).optional(),
    // The organization is ours, not Paddle's: it rides along in custom_data,
    // set when the checkout is created.
    custom_data: z
      .object({
        organization_id: z.string().uuid().optional(),
        organizationId: z.string().uuid().optional(),
      })
      .nullable()
      .optional(),
    current_billing_period: z
      .object({
        starts_at: z.string().nullable().optional(),
        ends_at: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    // The plan is identified only by the price id, hence the reverse map.
    items: z
      .array(
        z.object({
          price: z.object({ id: z.string().min(1) }).nullable().optional(),
          trial_dates: z
            .object({
              starts_at: z.string().nullable().optional(),
              ends_at: z.string().nullable().optional(),
            })
            .nullable()
            .optional(),
        }),
      )
      .optional(),
    // `cancel at period end` is not a boolean in Paddle: it is a pending
    // scheduled change whose action is `cancel`.
    scheduled_change: z
      .object({
        action: z.enum(["cancel", "pause", "resume"]),
        effective_at: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  }),
});

/** Only subscription events change an organization's plan. */
export function isSupportedPaddleEventType(eventType: string): boolean {
  return eventType.startsWith("subscription.");
}

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
 * HMAC-SHA256 verification of Paddle's `Paddle-Signature` header.
 *
 * The header is `ts=<unix>;h1=<hex>` — semicolon-separated — and the signed
 * payload is the timestamp and the *raw* body joined with a **colon**:
 * `<ts>:<rawBody>`. Both differ from Stripe's `t=,v1=` / `<ts>.<body>`, which
 * this function used to implement; a Stripe-shaped verifier rejects every real
 * Paddle webhook, silently, because paid activation is webhook-only.
 *
 * The body must be passed exactly as received: any re-serialization changes the
 * bytes and invalidates the signature.
 *
 * @see https://developer.paddle.com/webhooks/signature-verification
 */
export function verifyBillingWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  now = Date.now(),
): boolean {
  if (!header || !secret) return false;

  const parts = Object.fromEntries(
    header.split(";").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  const timestamp = parts.ts;
  const provided = parts.h1;
  // Require an explicit `ts=` timestamp and `h1=` signature — no timestamp-less
  // fallback. Every accepted event is therefore bound to the replay window, and
  // a captured signature cannot be stripped of its timestamp to bypass it.
  if (!timestamp || !provided || !/^[a-f0-9]{64}$/i.test(provided)) return false;

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 5 * 60 * 1000) {
    return false;
  }

  const signedPayload = `${timestamp}:${rawBody}`;
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
  config: PaddleConfig = getPaddleConfig(),
): NormalizedBillingWebhookEvent {
  const json = JSON.parse(rawBody) as unknown;
  const parsed = paddleSubscriptionEventSchema.parse(json);
  const data = parsed.data;

  const internalStatus = providerStatusToInternal(
    data.status as ProviderSubscriptionStatus | undefined,
  );

  // The plan rides on the price id, never on a slug. An unrecognized price
  // resolves to nothing rather than to a guess. The map cannot yield `trial`,
  // which is what keeps a provider webhook from activating the trial plan.
  const plan =
    data.items
      ?.map((item) => planForPaddlePriceIdFromConfig(config, item.price?.id))
      .find((resolved) => resolved != null) ?? null;

  const currentPeriodStart = normalizeProviderTimestamp(data.current_billing_period?.starts_at);
  const currentPeriodEnd = normalizeProviderTimestamp(data.current_billing_period?.ends_at);
  const trialDates = data.items?.find((item) => item.trial_dates)?.trial_dates ?? null;
  const trialStart = normalizeProviderTimestamp(trialDates?.starts_at);
  const trialEnd = normalizeProviderTimestamp(trialDates?.ends_at);
  const cancelAtPeriodEnd = data.scheduled_change
    ? data.scheduled_change.action === "cancel"
    : null;

  return {
    provider,
    providerEventId: parsed.event_id,
    eventType: parsed.event_type,
    eventCreatedAt: normalizeCreatedAt(parsed.occurred_at),
    providerCustomerId: data.customer_id ?? null,
    providerSubscriptionId: data.id ?? null,
    organizationId:
      data.custom_data?.organization_id ?? data.custom_data?.organizationId ?? null,
    planSlug: plan?.planCode ?? null,
    billingCycle: plan?.billingCycle ?? null,
    internalStatus,
    currentPeriodStart,
    currentPeriodEnd,
    trialStart,
    trialEnd,
    cancelAtPeriodEnd,
    payload: {
      source: "billing_provider_webhook",
      event_type: parsed.event_type,
      notification_id: parsed.notification_id ?? null,
      provider_status: data.status ?? null,
      internal_status: internalStatus,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      trial_start: trialStart,
      trial_end: trialEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
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
