import { describe, expect, it } from "vitest";
import {
  assertCatalogConsistency,
  commercialPlanCatalog,
  commercialPlans,
  featureKeyToEntitlementKey,
  usageMetricToLimitKey,
} from "./plan-catalog";
import { getPublicPlanViews } from "./public-plan-view";
import { getPaddleConfig } from "./config/paddle-env";
import { commercialFeatureKeys, commercialUsageMetricKeys } from "./plan-catalog.schema";

describe("commercial plan catalog", () => {
  it("keeps every plan aligned with every feature and usage metric", () => {
    expect(() => assertCatalogConsistency()).not.toThrow();
    expect(commercialPlans.map((plan) => plan.key)).toEqual(["free", "starter", "pro", "business"]);
  });

  it("maps public feature keys to backend entitlement keys", () => {
    for (const featureKey of commercialFeatureKeys) {
      expect(featureKeyToEntitlementKey[featureKey]).toBeTruthy();
    }
    expect(featureKeyToEntitlementKey["documents.process"]).toBe("documents.process");
  });

  it("maps public usage metrics to backend limit keys", () => {
    for (const metricKey of commercialUsageMetricKeys) {
      expect(usageMetricToLimitKey[metricKey]).toBeTruthy();
    }
    expect(usageMetricToLimitKey.documents_processed_monthly).toBe("documents_processed.monthly");
    expect(commercialPlanCatalog.business.usageLimits.automation_runs_monthly).toBeNull();
  });

  it("renders public pricing from the commercial catalog in private beta mode", () => {
    const plans = getPublicPlanViews(getPaddleConfig({ BILLING_MODE: "private_beta" }));

    expect(plans.map((plan) => plan.key)).toEqual(commercialPlans.map((plan) => plan.key));
    expect(plans.every((plan) => plan.cta.mode === "private_beta")).toBe(true);
    expect(plans.find((plan) => plan.key === "pro")?.price).toEqual({
      amount: commercialPlanCatalog.pro.monthlyPrice,
      currency: commercialPlanCatalog.pro.currency,
      interval: "month",
    });
    expect(plans.find((plan) => plan.key === "business")?.limits).toContainEqual({
      key: "documents_processed_monthly",
      label: "Documents processed",
      value: "Unlimited",
    });
  });

  it("enables checkout CTAs only when Paddle mode has price IDs", () => {
    const plans = getPublicPlanViews(getPaddleConfig({
      BILLING_MODE: "paid_beta",
      PADDLE_API_KEY: "pdl_sdbx_placeholder",
      PADDLE_WEBHOOK_SECRET: "pdl_ntfset_placeholder",
      PADDLE_PRICE_STARTER_MONTHLY: "pri_starter_monthly",
      PADDLE_PRICE_STARTER_YEARLY: "pri_starter_yearly",
      PADDLE_PRICE_PRO_MONTHLY: "pri_pro_monthly",
      PADDLE_PRICE_PRO_YEARLY: "pri_pro_yearly",
      PADDLE_PRICE_BUSINESS_MONTHLY: "pri_business_monthly",
      PADDLE_PRICE_BUSINESS_YEARLY: "pri_business_yearly",
    }));

    expect(plans.find((plan) => plan.key === "starter")?.cta.mode).toBe("checkout");
    expect(plans.find((plan) => plan.key === "pro")?.cta.mode).toBe("checkout");
    expect(plans.find((plan) => plan.key === "business")?.cta.mode).toBe("contact");
  });
});
