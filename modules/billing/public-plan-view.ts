import "server-only";

import {
  commercialFeatureLabels,
  commercialPlans,
  commercialUsageLabels,
  formatCommercialLimit,
} from "./plan-catalog";
import {
  getPaddleConfig,
  paddlePriceIdForPlanFromConfig,
  type PaddleConfig,
} from "./config/paddle-env";
import type { CommercialPlanKey, CommercialUsageMetricKey } from "./plan-catalog.schema";

export type PublicPlanView = {
  key: CommercialPlanKey;
  planSlug: string;
  name: string;
  description: string;
  recommended: boolean;
  price: {
    amount: number | null;
    currency: "EUR";
    interval: "month" | "year" | null;
  };
  limits: Array<{
    key: CommercialUsageMetricKey;
    label: string;
    value: string;
  }>;
  features: string[];
  cta: {
    label: string;
    mode: "checkout" | "contact" | "current" | "private_beta";
  };
  upgradeValue: string;
};

function ctaForPlan(
  plan: (typeof commercialPlans)[number],
  config: PaddleConfig,
): PublicPlanView["cta"] {
  if (config.mode === "private_beta") return { label: "Request access", mode: "private_beta" };
  if (plan.key === "free") return { label: "Start free", mode: "current" };
  if (plan.contactSales) return { label: "Contact sales", mode: "contact" };

  const priceId = paddlePriceIdForPlanFromConfig(config, plan.planSlug, "monthly");
  return priceId && plan.checkoutEnabled
    ? { label: "Choose plan", mode: "checkout" }
    : { label: "Contact us", mode: "contact" };
}

export function getPublicPlanViews(config = getPaddleConfig()): PublicPlanView[] {
  return commercialPlans.map((plan) => ({
    key: plan.key,
    planSlug: plan.planSlug,
    name: plan.name,
    description: plan.description,
    recommended: plan.recommended,
    price: {
      amount: plan.monthlyPrice === 0 ? null : plan.monthlyPrice,
      // Single source of truth: the currency comes from the catalog, never a
      // literal here. The catalog types it as "EUR", so this cannot drift to USD.
      currency: plan.currency,
      interval: plan.monthlyPrice === 0 ? null : "month",
    },
    limits: Object.entries(plan.usageLimits).map(([key, value]) => {
      const metricKey = key as CommercialUsageMetricKey;
      return {
        key: metricKey,
        label: commercialUsageLabels[metricKey],
        value: formatCommercialLimit(metricKey, value),
      };
    }),
    features: plan.featureKeys.map((key) => commercialFeatureLabels[key]),
    cta: ctaForPlan(plan, config),
    upgradeValue: plan.upgradeValue,
  }));
}
