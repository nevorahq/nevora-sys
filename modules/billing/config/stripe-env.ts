import "server-only";

import type { BillingCycle, PlanSlug } from "../constants/billing.constants";

export type StripeRuntimeMode = "stripe" | "private_beta";

export type StripeConfig = {
  mode: StripeRuntimeMode;
  secretKey?: string;
  webhookSecret?: string;
  publishableKey?: string;
  prices: {
    starterMonthly?: string;
    starterYearly?: string;
    proMonthly?: string;
    proYearly?: string;
    businessMonthly?: string;
    businessYearly?: string;
  };
};

export class BillingConfigError extends Error {
  constructor(readonly missing: string[]) {
    super(`Billing provider is configured for Stripe but missing: ${missing.join(", ")}`);
    this.name = "BillingConfigError";
  }
}

type EnvSource = Record<string, string | undefined>;

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveMode(env: EnvSource): StripeRuntimeMode {
  const explicit = env.BILLING_MODE ?? env.STRIPE_RUNTIME_MODE;
  if (explicit === "stripe" || explicit === "private_beta") return explicit;

  return "private_beta";
}

export function getStripeConfig(env: EnvSource = process.env): StripeConfig {
  const config: StripeConfig = {
    mode: resolveMode(env),
    secretKey: nonEmpty(env.STRIPE_SECRET_KEY),
    webhookSecret: nonEmpty(env.STRIPE_WEBHOOK_SECRET),
    publishableKey: nonEmpty(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    prices: {
      starterMonthly: nonEmpty(env.STRIPE_PRICE_STARTER_MONTHLY ?? env.STRIPE_PRICE_START_MONTHLY),
      starterYearly: nonEmpty(env.STRIPE_PRICE_STARTER_YEARLY ?? env.STRIPE_PRICE_START_YEARLY),
      proMonthly: nonEmpty(env.STRIPE_PRICE_PRO_MONTHLY),
      proYearly: nonEmpty(env.STRIPE_PRICE_PRO_YEARLY),
      businessMonthly: nonEmpty(env.STRIPE_PRICE_BUSINESS_MONTHLY),
      businessYearly: nonEmpty(env.STRIPE_PRICE_BUSINESS_YEARLY),
    },
  };

  const missing = getStripeConfigMissing(config);
  if (config.mode === "stripe" && env.NODE_ENV === "production" && missing.length > 0) {
    throw new BillingConfigError(missing);
  }

  return config;
}

export function getStripeConfigMissing(config = getStripeConfig()): string[] {
  if (config.mode !== "stripe") return [];

  const missing: string[] = [];
  if (!config.secretKey) missing.push("STRIPE_SECRET_KEY");
  if (!config.webhookSecret) missing.push("STRIPE_WEBHOOK_SECRET");
  if (!config.prices.starterMonthly) missing.push("STRIPE_PRICE_STARTER_MONTHLY");
  if (!config.prices.starterYearly) missing.push("STRIPE_PRICE_STARTER_YEARLY");
  if (!config.prices.proMonthly) missing.push("STRIPE_PRICE_PRO_MONTHLY");
  if (!config.prices.proYearly) missing.push("STRIPE_PRICE_PRO_YEARLY");
  if (!config.prices.businessMonthly) missing.push("STRIPE_PRICE_BUSINESS_MONTHLY");
  if (!config.prices.businessYearly) missing.push("STRIPE_PRICE_BUSINESS_YEARLY");
  return missing;
}

export function isStripeCheckoutAvailable(config = getStripeConfig()): boolean {
  return config.mode === "stripe" && getStripeConfigMissing(config).length === 0;
}

export function stripePriceIdForPlanFromConfig(
  config: StripeConfig,
  planCode: PlanSlug,
  billingCycle: BillingCycle,
): string | null {
  if (planCode === "trial" || planCode === "free" || planCode === "enterprise") return null;

  if (planCode === "start") {
    return billingCycle === "monthly"
      ? config.prices.starterMonthly ?? null
      : config.prices.starterYearly ?? null;
  }

  if (planCode === "pro") {
    return billingCycle === "monthly"
      ? config.prices.proMonthly ?? null
      : config.prices.proYearly ?? null;
  }

  if (planCode === "business") {
    return billingCycle === "monthly"
      ? config.prices.businessMonthly ?? null
      : config.prices.businessYearly ?? null;
  }

  return null;
}
