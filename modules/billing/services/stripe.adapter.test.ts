import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./billing-repository", () => ({
  billingRepository: {
    getProviderCustomerId: vi.fn(),
  },
}));

import { stripePriceIdForPlan, verifyStripeWebhookSignature } from "./stripe.adapter";

function stripeSignature(rawBody: string, secret: string, timestamp: number) {
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

describe("Stripe billing adapter helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies native Stripe webhook signatures", () => {
    const rawBody = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated" });
    const now = Date.parse("2026-07-08T12:00:00.000Z");
    const timestamp = Math.floor(now / 1000);

    expect(
      verifyStripeWebhookSignature(
        rawBody,
        stripeSignature(rawBody, "whsec_test", timestamp),
        "whsec_test",
        now,
      ),
    ).toBe(true);
    expect(
      verifyStripeWebhookSignature(
        rawBody,
        stripeSignature(rawBody, "wrong", timestamp),
        "whsec_test",
        now,
      ),
    ).toBe(false);
    expect(
      verifyStripeWebhookSignature(
        rawBody,
        stripeSignature(rawBody, "whsec_test", timestamp - 600),
        "whsec_test",
        now,
      ),
    ).toBe(false);
  });

  it("resolves price IDs from explicit plan and cycle env vars", () => {
    vi.stubEnv("STRIPE_PRICE_STARTER_MONTHLY", "price_starter_monthly");
    vi.stubEnv("STRIPE_PRICE_PRO_YEARLY", "price_pro_yearly");

    expect(stripePriceIdForPlan("start", "monthly")).toBe("price_starter_monthly");
    expect(stripePriceIdForPlan("pro", "yearly")).toBe("price_pro_yearly");
    expect(stripePriceIdForPlan("trial", "monthly")).toBeNull();
  });
});
