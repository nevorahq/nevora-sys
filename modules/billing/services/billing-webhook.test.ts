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
  parseBillingWebhookEvent,
  verifyBillingWebhookSignature,
} from "./billing-webhook";

function signedHeader(rawBody: string, secret: string, timestamp: number) {
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

describe("billing webhook boundary", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("rejects missing, stale, and invalid webhook signatures", () => {
    const rawBody = JSON.stringify({ id: "evt_1", type: "subscription.updated", data: {} });
    const now = Date.parse("2026-07-07T12:00:00.000Z");
    const timestamp = Math.floor(now / 1000);

    expect(verifyBillingWebhookSignature(rawBody, null, "secret", now)).toBe(false);
    expect(verifyBillingWebhookSignature(rawBody, "bad", "secret", now)).toBe(false);
    expect(
      verifyBillingWebhookSignature(
        rawBody,
        signedHeader(rawBody, "secret", timestamp - 600),
        "secret",
        now,
      ),
    ).toBe(false);
  });

  it("accepts a valid HMAC signature", () => {
    const rawBody = JSON.stringify({ id: "evt_1", type: "subscription.updated", data: {} });
    const now = Date.parse("2026-07-07T12:00:00.000Z");
    const timestamp = Math.floor(now / 1000);

    expect(
      verifyBillingWebhookSignature(
        rawBody,
        signedHeader(rawBody, "secret", timestamp),
        "secret",
        now,
      ),
    ).toBe(true);
  });

  it("normalizes active provider payloads without retaining raw email fields", () => {
    const event = parseBillingWebhookEvent(
      JSON.stringify({
        id: "evt_active",
        type: "subscription.updated",
        created: 1_783_426_400,
        data: {
          customerId: "cus_123",
          subscriptionId: "sub_123",
          organizationId: "11111111-1111-4111-8111-111111111111",
          planCode: "pro",
          billingCycle: "monthly",
          status: "active",
          email: "owner@example.com",
        },
      }),
      "stripe",
    );

    expect(event).toMatchObject({
      provider: "stripe",
      providerEventId: "evt_active",
      providerCustomerId: "cus_123",
      providerSubscriptionId: "sub_123",
      planSlug: "pro",
      internalStatus: "active",
    });
    expect(JSON.stringify(event.payload)).not.toContain("owner@example.com");
  });

  it("does not allow provider payloads to set developer_unlimited", () => {
    expect(() =>
      parseBillingWebhookEvent(
        JSON.stringify({
          id: "evt_dev",
          type: "subscription.updated",
          data: {
            customerId: "cus_123",
            internalStatus: "developer_unlimited",
          },
        }),
        "stripe",
      ),
    ).toThrow();
  });

  it("applies valid webhook events through the isolated RPC", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        ok: true,
        duplicate: false,
        organization_id: "11111111-1111-4111-8111-111111111111",
        subscription_id: "22222222-2222-4222-8222-222222222222",
      },
      error: null,
    });

    const event = parseBillingWebhookEvent(
      JSON.stringify({
        id: "evt_apply",
        type: "subscription.updated",
        created: "2026-07-07T12:00:00.000Z",
        data: {
          customerId: "cus_123",
          subscriptionId: "sub_123",
          organizationId: "11111111-1111-4111-8111-111111111111",
          planCode: "business",
          billingCycle: "yearly",
          status: "active",
        },
      }),
      "stripe",
    );

    await expect(applyBillingProviderEvent(event)).resolves.toMatchObject({
      ok: true,
      duplicate: false,
      organizationId: "11111111-1111-4111-8111-111111111111",
    });
    expect(rpcMock).toHaveBeenCalledWith("apply_billing_provider_event", {
      p_provider: "stripe",
      p_provider_event_id: "evt_apply",
      p_event_type: "subscription.updated",
      p_event_created_at: "2026-07-07T12:00:00.000Z",
      p_provider_customer_id: "cus_123",
      p_provider_subscription_id: "sub_123",
      p_organization_id: "11111111-1111-4111-8111-111111111111",
      p_plan_slug: "business",
      p_billing_cycle: "yearly",
      p_internal_status: "active",
      p_payload: expect.objectContaining({ source: "billing_provider_webhook" }),
    });
  });

  it("treats duplicate provider events as safely accepted", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, duplicate: true },
      error: null,
    });

    const event = parseBillingWebhookEvent(
      JSON.stringify({
        id: "evt_dup",
        type: "subscription.updated",
        data: {
          customerId: "cus_123",
          status: "past_due",
        },
      }),
      "stripe",
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
      JSON.stringify({
        id: "evt_old",
        type: "subscription.updated",
        created: "2026-07-01T12:00:00.000Z",
        data: {
          customerId: "cus_123",
          subscriptionId: "sub_123",
          status: "canceled",
        },
      }),
      "stripe",
    );

    await expect(applyBillingProviderEvent(event)).resolves.toMatchObject({
      ok: true,
      duplicate: false,
      ignoredReason: "out_of_order",
    });
  });
});
