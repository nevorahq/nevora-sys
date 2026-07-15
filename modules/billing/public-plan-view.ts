import "server-only";

import { commercialPlans } from "./plan-catalog";
import {
  ctaByLocale,
  featureLabelByLocale,
  formatLimitValue,
  planCopyByLocale,
  usageLabelByLocale,
} from "./plan-catalog.i18n";
import {
  getPaddleConfig,
  paddlePriceIdForPlanFromConfig,
  type PaddleConfig,
} from "./config/paddle-env";
import type { CommercialPlanKey, CommercialUsageMetricKey } from "./plan-catalog.schema";
import type { PublicLocale } from "@/shared/i18n/constants";

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
  locale: PublicLocale,
): PublicPlanView["cta"] {
  const cta = ctaByLocale[locale];

  // Закрытая бета: платная оплата невозможна. Free-план ведёт в реальную
  // регистрацию (пробный период открыт, без ручного одобрения), платные — без
  // действия («будет доступно после беты»). Режим остаётся `private_beta` для
  // всех (это пинит plan-catalog.test), различается только копирайт/поведение.
  if (config.mode === "private_beta") {
    return {
      label: plan.key === "free" ? cta.startTrial : cta.availableAfterBeta,
      mode: "private_beta",
    };
  }
  if (plan.key === "free") return { label: cta.startTrial, mode: "current" };
  if (plan.contactSales) return { label: cta.contactSales, mode: "contact" };

  const priceId = paddlePriceIdForPlanFromConfig(config, plan.planSlug, "monthly");
  return priceId && plan.checkoutEnabled
    ? { label: cta.choosePlan, mode: "checkout" }
    : { label: cta.contactUs, mode: "contact" };
}

export function getPublicPlanViews(
  config = getPaddleConfig(),
  locale: PublicLocale = "en",
): PublicPlanView[] {
  return commercialPlans.map((plan) => {
    const copy = planCopyByLocale[locale][plan.key];
    return {
      key: plan.key,
      planSlug: plan.planSlug,
      name: copy.name,
      description: copy.description,
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
          label: usageLabelByLocale[locale][metricKey],
          value: formatLimitValue(metricKey, value, locale),
        };
      }),
      features: plan.featureKeys.map((key) => featureLabelByLocale[locale][key]),
      cta: ctaForPlan(plan, config, locale),
      upgradeValue: copy.upgradeValue,
    };
  });
}
