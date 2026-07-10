import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: () => ({ rpc: rpcMock }),
}));

import {
  applyBillingProviderEvent,
  isSupportedPaddleEventType,
  parseBillingWebhookEvent,
  verifyBillingWebhookSignature,
} from "./billing-webhook";
import type { PaddleConfig } from "../config/paddle-env";

/**
 * Paddle signs `<ts>:<rawBody>` and sends `ts=<ts>;h1=<hex>`.
 *
 * This helper mirrors that construction, which means on its own it can only
 * prove the verifier is self-consistent — the previous version of this file did
 * exactly that against Stripe's `t=,v1=` format and passed while no real
 * webhook could ever be accepted. The frozen-vector test below is what actually
 * pins the algorithm; this helper only keeps the other cases readable.
 */
function paddleHeader(rawBody: string, secret: string, timestamp: number) {
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}:${rawBody}`)
    .digest("hex");
  return `ts=${timestamp};h1=${signature}`;
}

const TEST_CONFIG: PaddleConfig = {
  mode: "paid_beta",
  environment: "sandbox",
  webhookSecret: "pdl_ntfset_test_secret",
  prices: {
    starterMonthly: "pri_starter_monthly",
    starterYearly: "pri_starter_yearly",
    proMonthly: "pri_pro_monthly",
    proYearly: "pri_pro_yearly",
    businessMonthly: "pri_business_monthly",
    businessYearly: "pri_business_yearly",
  },
};

const ORG_ID = "11111111-1111-4111-8111-111111111111";

/** A realistic Paddle subscription event. Shape follows Paddle's docs. */
function paddleSubscriptionEvent(overrides: {
  eventId?: string;
  eventType?: string;
  occurredAt?: string;
  status?: string;
  priceId?: string;
  organizationId?: string | null;
  scheduledChange?: { action: string; effective_at?: string } | null;
  trialDates?: { starts_at: string; ends_at: string } | null;
  extraData?: Record<string, unknown>;
} = {}) {
  return {
    event_id: overrides.eventId ?? "evt_01hv8ytwcg91n07pa4jmvsdcst",
    event_type: overrides.eventType ?? "subscription.updated",
    occurred_at: overrides.occurredAt ?? "2026-07-07T12:00:00.000Z",
    notification_id: "ntf_01hv8ytwevhn1sdtwzhf4rz548",
    data: {
      id: "sub_01h04vsc0qhwtqfgtq5c0d2fdj",
      status: overrides.status ?? "active",
      customer_id: "ctm_01h04vsbxqhwtqfgtq5c0d2fdj",
      custom_data:
        overrides.organizationId === null ? null : { organization_id: overrides.organizationId ?? ORG_ID },
      current_billing_period: {
        starts_at: "2026-07-01T00:00:00.000Z",
        ends_at: "2026-08-01T00:00:00.000Z",
      },
      billing_cycle: { interval: "month", frequency: 1 },
      items: [
        {
          price: { id: overrides.priceId ?? "pri_pro_monthly", product_id: "pro_123" },
          trial_dates: overrides.trialDates ?? null,
          status: "active",
        },
      ],
      scheduled_change: overrides.scheduledChange ?? null,
      ...overrides.extraData,
    },
  };
}

describe("paddle webhook signature", () => {
  it("verifies a frozen Paddle signature vector", () => {
    // Computed independently against Paddle's documented construction:
    //   HMAC-SHA256(secret, `${ts}:${rawBody}`)
    // If someone reverts the verifier to Stripe's `${ts}.${rawBody}`, or to a
    // comma-separated `t=,v1=` header, this vector stops matching. That is the
    // whole point: the constants below are not derived from the code under test.
    const rawBody = '{"event_id":"evt_frozen","event_type":"subscription.updated","data":{}}';
    const secret = "pdl_ntfset_test_secret";
    const ts = 1671552777;
    const h1 = "43009deb0a1d0740aa6b3d58d0473e49f5858eced3d8dc97cc80faa14ff0d4a5";
    const now = ts * 1000;

    expect(verifyBillingWebhookSignature(rawBody, `ts=${ts};h1=${h1}`, secret, now)).toBe(true);
  });

  it("rejects Stripe's header format outright", () => {
    // The regression this file exists for: `t=…,v1=…` over `${ts}.${rawBody}`.
    const rawBody = JSON.stringify(paddleSubscriptionEvent());
    const now = Date.parse("2026-07-07T12:00:00.000Z");
    const ts = Math.floor(now / 1000);
    const stripeSig = crypto
      .createHmac("sha256", "secret")
      .update(`${ts}.${rawBody}`)
      .digest("hex");

    expect(verifyBillingWebhookSignature(rawBody, `t=${ts},v1=${stripeSig}`, "secret", now)).toBe(false);
  });

  it("rejects missing, malformed and stale signatures", () => {
    const rawBody = JSON.stringify(paddleSubscriptionEvent());
    const now = Date.parse("2026-07-07T12:00:00.000Z");
    const ts = Math.floor(now / 1000);

    expect(verifyBillingWebhookSignature(rawBody, null, "secret", now)).toBe(false);
    expect(verifyBillingWebhookSignature(rawBody, "bad", "secret", now)).toBe(false);
    expect(verifyBillingWebhookSignature(rawBody, paddleHeader(rawBody, "secret", ts), undefined, now)).toBe(false);
    // Outside the 5-minute replay window.
    expect(
      verifyBillingWebhookSignature(rawBody, paddleHeader(rawBody, "secret", ts - 600), "secret", now),
    ).toBe(false);
    // Right secret, wrong body.
    expect(
      verifyBillingWebhookSignature("{}", paddleHeader(rawBody, "secret", ts), "secret", now),
    ).toBe(false);
  });

  it("rejects a signature with no timestamp (no timestamp-less fallback)", () => {
    const rawBody = JSON.stringify(paddleSubscriptionEvent());
    const now = Date.parse("2026-07-07T12:00:00.000Z");

    const bareSig = crypto.createHmac("sha256", "secret").update(rawBody).digest("hex");
    expect(verifyBillingWebhookSignature(rawBody, bareSig, "secret", now)).toBe(false);
    expect(verifyBillingWebhookSignature(rawBody, `h1=${bareSig}`, "secret", now)).toBe(false);
  });

  it("accepts a well-formed Paddle header", () => {
    const rawBody = JSON.stringify(paddleSubscriptionEvent());
    const now = Date.parse("2026-07-07T12:00:00.000Z");
    const ts = Math.floor(now / 1000);

    expect(
      verifyBillingWebhookSignature(rawBody, paddleHeader(rawBody, "secret", ts), "secret", now),
    ).toBe(true);
  });
});

describe("paddle event type support", () => {
  it("handles subscription events and ignores the rest", () => {
    expect(isSupportedPaddleEventType("subscription.updated")).toBe(true);
    expect(isSupportedPaddleEventType("subscription.canceled")).toBe(true);
    expect(isSupportedPaddleEventType("transaction.completed")).toBe(false);
    expect(isSupportedPaddleEventType("customer.updated")).toBe(false);
  });
});

describe("paddle event parsing", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("resolves the plan from the price id, not from a slug", () => {
    const event = parseBillingWebhookEvent(
      JSON.stringify(paddleSubscriptionEvent({ priceId: "pri_business_yearly" })),
      "paddle",
      TEST_CONFIG,
    );

    expect(event).toMatchObject({
      provider: "paddle",
      providerEventId: "evt_01hv8ytwcg91n07pa4jmvsdcst",
      eventType: "subscription.updated",
      providerCustomerId: "ctm_01h04vsbxqhwtqfgtq5c0d2fdj",
      providerSubscriptionId: "sub_01h04vsc0qhwtqfgtq5c0d2fdj",
      organizationId: ORG_ID,
      planSlug: "business",
      billingCycle: "yearly",
      internalStatus: "active",
      currentPeriodStart: "2026-07-01T00:00:00.000Z",
      currentPeriodEnd: "2026-08-01T00:00:00.000Z",
    });
  });

  it("resolves no plan for a price id that is not ours", () => {
    const event = parseBillingWebhookEvent(
      JSON.stringify(paddleSubscriptionEvent({ priceId: "pri_someone_elses" })),
      "paddle",
      TEST_CONFIG,
    );

    // An unknown price must resolve to nothing rather than to a guess.
    expect(event.planSlug).toBeNull();
    expect(event.billingCycle).toBeNull();
  });

  it("reads the organization from custom_data, and tolerates its absence", () => {
    const withOrg = parseBillingWebhookEvent(
      JSON.stringify(paddleSubscriptionEvent()),
      "paddle",
      TEST_CONFIG,
    );
    expect(withOrg.organizationId).toBe(ORG_ID);

    const withoutOrg = parseBillingWebhookEvent(
      JSON.stringify(paddleSubscriptionEvent({ organizationId: null })),
      "paddle",
      TEST_CONFIG,
    );
    expect(withoutOrg.organizationId).toBeNull();
  });

  it("maps a pending cancel scheduled_change onto cancelAtPeriodEnd", () => {
    const canceling = parseBillingWebhookEvent(
      JSON.stringify(
        paddleSubscriptionEvent({
          scheduledChange: { action: "cancel", effective_at: "2026-08-01T00:00:00.000Z" },
        }),
      ),
      "paddle",
      TEST_CONFIG,
    );
    expect(canceling.cancelAtPeriodEnd).toBe(true);

    // A pause is a scheduled change too, but it is not a cancellation.
    const pausing = parseBillingWebhookEvent(
      JSON.stringify(paddleSubscriptionEvent({ scheduledChange: { action: "pause" } })),
      "paddle",
      TEST_CONFIG,
    );
    expect(pausing.cancelAtPeriodEnd).toBe(false);

    const plain = parseBillingWebhookEvent(
      JSON.stringify(paddleSubscriptionEvent()),
      "paddle",
      TEST_CONFIG,
    );
    expect(plain.cancelAtPeriodEnd).toBeNull();
  });

  it("reads trial dates off the subscription item", () => {
    const event = parseBillingWebhookEvent(
      JSON.stringify(
        paddleSubscriptionEvent({
          status: "trialing",
          trialDates: { starts_at: "2026-07-01T00:00:00.000Z", ends_at: "2026-07-15T00:00:00.000Z" },
        }),
      ),
      "paddle",
      TEST_CONFIG,
    );

    expect(event.internalStatus).toBe("trialing");
    expect(event.trialStart).toBe("2026-07-01T00:00:00.000Z");
    expect(event.trialEnd).toBe("2026-07-15T00:00:00.000Z");
  });

  it("maps Paddle's statuses onto internal ones", () => {
    const statuses: Array<[string, string]> = [
      ["active", "active"],
      ["trialing", "trialing"],
      ["past_due", "past_due"],
      ["canceled", "canceled"],
      ["paused", "suspended"],
    ];

    for (const [providerStatus, internal] of statuses) {
      const event = parseBillingWebhookEvent(
        JSON.stringify(paddleSubscriptionEvent({ status: providerStatus })),
        "paddle",
        TEST_CONFIG,
      );
      expect(event.internalStatus, `${providerStatus} -> ${internal}`).toBe(internal);
    }
  });

  it("cannot be told to grant developer_unlimited", () => {
    // The status is derived from Paddle's own enum; the payload has no field
    // that could name an internal status at all.
    const event = parseBillingWebhookEvent(
      JSON.stringify(
        paddleSubscriptionEvent({ extraData: { internal_status: "developer_unlimited" } }),
      ),
      "paddle",
      TEST_CONFIG,
    );
    expect(event.internalStatus).toBe("active");
    expect(JSON.stringify(event.payload)).not.toContain("developer_unlimited");
  });

  it("does not retain raw customer email fields in the stored payload", () => {
    const event = parseBillingWebhookEvent(
      JSON.stringify(paddleSubscriptionEvent({ extraData: { email: "owner@example.com" } })),
      "paddle",
      TEST_CONFIG,
    );
    expect(JSON.stringify(event.payload)).not.toContain("owner@example.com");
  });

  it("rejects a Stripe-shaped envelope", () => {
    expect(() =>
      parseBillingWebhookEvent(
        JSON.stringify({ id: "evt_1", type: "subscription.updated", data: {} }),
        "paddle",
        TEST_CONFIG,
      ),
    ).toThrow();
  });
});

describe("applying paddle events through the isolated RPC", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("applies a valid event", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        ok: true,
        duplicate: false,
        organization_id: ORG_ID,
        subscription_id: "22222222-2222-4222-8222-222222222222",
      },
      error: null,
    });

    const event = parseBillingWebhookEvent(
      JSON.stringify(paddleSubscriptionEvent({ eventId: "evt_apply", priceId: "pri_business_yearly" })),
      "paddle",
      TEST_CONFIG,
    );

    await expect(applyBillingProviderEvent(event)).resolves.toMatchObject({
      ok: true,
      duplicate: false,
      organizationId: ORG_ID,
    });
    expect(rpcMock).toHaveBeenCalledWith("apply_billing_provider_event", {
      p_provider: "paddle",
      p_provider_event_id: "evt_apply",
      p_event_type: "subscription.updated",
      p_event_created_at: "2026-07-07T12:00:00.000Z",
      p_provider_customer_id: "ctm_01h04vsbxqhwtqfgtq5c0d2fdj",
      p_provider_subscription_id: "sub_01h04vsc0qhwtqfgtq5c0d2fdj",
      p_organization_id: ORG_ID,
      p_plan_slug: "business",
      p_billing_cycle: "yearly",
      p_internal_status: "active",
      p_payload: expect.objectContaining({ source: "billing_provider_webhook" }),
    });
  });

  it("treats duplicate provider events as safely accepted", async () => {
    rpcMock.mockResolvedValueOnce({ data: { ok: true, duplicate: true }, error: null });

    const event = parseBillingWebhookEvent(
      JSON.stringify(paddleSubscriptionEvent({ eventId: "evt_dup", status: "past_due" })),
      "paddle",
      TEST_CONFIG,
    );

    await expect(applyBillingProviderEvent(event)).resolves.toMatchObject({
      ok: true,
      duplicate: true,
    });
  });

  it("surfaces out-of-order provider events as accepted but ignored", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, duplicate: false, ignored_reason: "out_of_order" },
      error: null,
    });

    const event = parseBillingWebhookEvent(
      JSON.stringify(
        paddleSubscriptionEvent({
          eventId: "evt_old",
          eventType: "subscription.canceled",
          status: "canceled",
          occurredAt: "2026-07-01T12:00:00.000Z",
        }),
      ),
      "paddle",
      TEST_CONFIG,
    );

    await expect(applyBillingProviderEvent(event)).resolves.toMatchObject({
      ok: true,
      duplicate: false,
      ignoredReason: "out_of_order",
    });
  });
});
