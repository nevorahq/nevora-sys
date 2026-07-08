import { describe, expect, it } from "vitest";
import {
  assertCatalogConsistency,
  commercialPlanCatalog,
  commercialPlans,
  featureKeyToEntitlementKey,
  usageMetricToLimitKey,
} from "./plan-catalog";
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
});
