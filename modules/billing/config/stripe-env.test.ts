import { describe, expect, it } from "vitest";
import {
  BillingConfigError,
  getStripeConfig,
  getStripeConfigMissing,
  isStripeCheckoutAvailable,
  stripePriceIdForPlanFromConfig,
} from "./stripe-env";

describe("Stripe env config", () => {
  it("defaults to private beta without requiring Stripe secrets", () => {
    const config = getStripeConfig({});

    expect(config.mode).toBe("private_beta");
    expect(getStripeConfigMissing(config)).toEqual([]);
    expect(isStripeCheckoutAvailable(config)).toBe(false);
  });

  it("reports missing runtime config in stripe mode", () => {
    const config = getStripeConfig({ BILLING_MODE: "stripe" });

    expect(config.mode).toBe("stripe");
    expect(getStripeConfigMissing(config)).toEqual([
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_STARTER_MONTHLY",
      "STRIPE_PRICE_STARTER_YEARLY",
      "STRIPE_PRICE_PRO_MONTHLY",
      "STRIPE_PRICE_PRO_YEARLY",
      "STRIPE_PRICE_BUSINESS_MONTHLY",
      "STRIPE_PRICE_BUSINESS_YEARLY",
    ]);
    expect(isStripeCheckoutAvailable(config)).toBe(false);
  });

  it("fails fast in production stripe mode when required values are missing", () => {
    expect(() => getStripeConfig({ NODE_ENV: "production", BILLING_MODE: "stripe" })).toThrow(BillingConfigError);
  });

  it("maps plan and interval to configured Stripe price IDs", () => {
    const config = getStripeConfig({
      BILLING_MODE: "stripe",
      STRIPE_SECRET_KEY: "stripe_secret_placeholder",
      STRIPE_WEBHOOK_SECRET: "stripe_webhook_secret_placeholder",
      STRIPE_PRICE_STARTER_MONTHLY: "price_starter_monthly",
      STRIPE_PRICE_STARTER_YEARLY: "price_starter_yearly",
      STRIPE_PRICE_PRO_MONTHLY: "price_pro_monthly",
      STRIPE_PRICE_PRO_YEARLY: "price_pro_yearly",
      STRIPE_PRICE_BUSINESS_MONTHLY: "price_business_monthly",
      STRIPE_PRICE_BUSINESS_YEARLY: "price_business_yearly",
    });

    expect(stripePriceIdForPlanFromConfig(config, "pro", "monthly")).toBe("price_pro_monthly");
    expect(stripePriceIdForPlanFromConfig(config, "business", "yearly")).toBe("price_business_yearly");
    expect(stripePriceIdForPlanFromConfig(config, "trial", "monthly")).toBeNull();
    expect(isStripeCheckoutAvailable(config)).toBe(true);
  });
});
