import { describe, expect, it } from "vitest";
import {
  BillingConfigError,
  getPaddleConfig,
  getPaddleConfigMissing,
  isPaddleCheckoutAvailable,
  paddlePriceIdForPlanFromConfig,
} from "./paddle-env";

describe("Paddle env config", () => {
  it("defaults to private beta without requiring Paddle secrets", () => {
    const config = getPaddleConfig({});

    expect(config.mode).toBe("private_beta");
    expect(getPaddleConfigMissing(config)).toEqual([]);
    expect(isPaddleCheckoutAvailable(config)).toBe(false);
  });

  it("reports missing runtime config in paid beta mode", () => {
    const config = getPaddleConfig({ BILLING_MODE: "paid_beta" });

    expect(config.mode).toBe("paid_beta");
    expect(getPaddleConfigMissing(config)).toEqual([
      "PADDLE_API_KEY",
      "PADDLE_WEBHOOK_SECRET",
      "PADDLE_PRICE_STARTER_MONTHLY",
      "PADDLE_PRICE_STARTER_YEARLY",
      "PADDLE_PRICE_PRO_MONTHLY",
      "PADDLE_PRICE_PRO_YEARLY",
      "PADDLE_PRICE_BUSINESS_MONTHLY",
      "PADDLE_PRICE_BUSINESS_YEARLY",
    ]);
    expect(isPaddleCheckoutAvailable(config)).toBe(false);
  });

  it("fails fast in production paid mode when required values are missing", () => {
    expect(() => getPaddleConfig({ NODE_ENV: "production", BILLING_MODE: "paid_beta" })).toThrow(BillingConfigError);
    expect(() => getPaddleConfig({ BILLING_MODE: "production" })).toThrow(BillingConfigError);
  });

  it("maps plan and interval to configured Paddle price IDs", () => {
    const config = getPaddleConfig({
      BILLING_MODE: "paid_beta",
      PADDLE_API_KEY: "pdl_sdbx_placeholder",
      PADDLE_WEBHOOK_SECRET: "pdl_ntfset_placeholder",
      PADDLE_PRICE_STARTER_MONTHLY: "pri_starter_monthly",
      PADDLE_PRICE_STARTER_YEARLY: "pri_starter_yearly",
      PADDLE_PRICE_PRO_MONTHLY: "pri_pro_monthly",
      PADDLE_PRICE_PRO_YEARLY: "pri_pro_yearly",
      PADDLE_PRICE_BUSINESS_MONTHLY: "pri_business_monthly",
      PADDLE_PRICE_BUSINESS_YEARLY: "pri_business_yearly",
    });

    expect(paddlePriceIdForPlanFromConfig(config, "pro", "monthly")).toBe("pri_pro_monthly");
    expect(paddlePriceIdForPlanFromConfig(config, "business", "yearly")).toBe("pri_business_yearly");
    expect(paddlePriceIdForPlanFromConfig(config, "trial", "monthly")).toBeNull();
    expect(isPaddleCheckoutAvailable(config)).toBe(true);
  });
});
