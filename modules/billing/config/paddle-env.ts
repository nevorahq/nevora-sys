import "server-only";

import type { BillingCycle, PlanSlug } from "../constants/billing.constants";

export type PaddleEnvironment = "sandbox" | "production";
export type BillingMode = "private_beta" | "paid_beta" | "production";

export type PaddleConfig = {
  mode: BillingMode;
  environment: PaddleEnvironment;
  apiKey?: string;
  clientToken?: string;
  webhookSecret?: string;
  sellerId?: string;
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
    super(`Billing provider is configured for Paddle but missing: ${missing.join(", ")}`);
    this.name = "BillingConfigError";
  }
}

type EnvSource = Record<string, string | undefined>;

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveMode(env: EnvSource): BillingMode {
  const explicit = env.BILLING_MODE;
  if (explicit === "paid_beta" || explicit === "production" || explicit === "private_beta") {
    return explicit;
  }

  return "private_beta";
}

function resolveEnvironment(env: EnvSource): PaddleEnvironment {
  return env.PADDLE_ENV === "production" ? "production" : "sandbox";
}

export function getPaddleConfig(env: EnvSource = process.env): PaddleConfig {
  const config: PaddleConfig = {
    mode: resolveMode(env),
    environment: resolveEnvironment(env),
    apiKey: nonEmpty(env.PADDLE_API_KEY),
    clientToken: nonEmpty(env.PADDLE_CLIENT_TOKEN),
    webhookSecret: nonEmpty(env.PADDLE_WEBHOOK_SECRET),
    sellerId: nonEmpty(env.PADDLE_SELLER_ID),
    prices: {
      starterMonthly: nonEmpty(env.PADDLE_PRICE_STARTER_MONTHLY),
      starterYearly: nonEmpty(env.PADDLE_PRICE_STARTER_YEARLY),
      proMonthly: nonEmpty(env.PADDLE_PRICE_PRO_MONTHLY),
      proYearly: nonEmpty(env.PADDLE_PRICE_PRO_YEARLY),
      businessMonthly: nonEmpty(env.PADDLE_PRICE_BUSINESS_MONTHLY),
      businessYearly: nonEmpty(env.PADDLE_PRICE_BUSINESS_YEARLY),
    },
  };

  const missing = getPaddleConfigMissing(config);
  const productionPaidMode = config.mode === "production" || (env.NODE_ENV === "production" && config.mode !== "private_beta");
  if (productionPaidMode && missing.length > 0) {
    throw new BillingConfigError(missing);
  }

  return config;
}

export function getPaddleConfigMissing(config = getPaddleConfig()): string[] {
  if (config.mode === "private_beta") return [];

  const missing: string[] = [];
  if (!config.apiKey) missing.push("PADDLE_API_KEY");
  if (!config.webhookSecret) missing.push("PADDLE_WEBHOOK_SECRET");
  if (!config.prices.starterMonthly) missing.push("PADDLE_PRICE_STARTER_MONTHLY");
  if (!config.prices.starterYearly) missing.push("PADDLE_PRICE_STARTER_YEARLY");
  if (!config.prices.proMonthly) missing.push("PADDLE_PRICE_PRO_MONTHLY");
  if (!config.prices.proYearly) missing.push("PADDLE_PRICE_PRO_YEARLY");
  if (!config.prices.businessMonthly) missing.push("PADDLE_PRICE_BUSINESS_MONTHLY");
  if (!config.prices.businessYearly) missing.push("PADDLE_PRICE_BUSINESS_YEARLY");
  return missing;
}

export function isPaddleCheckoutAvailable(config = getPaddleConfig()): boolean {
  return config.mode !== "private_beta" && getPaddleConfigMissing(config).length === 0;
}

/**
 * Reverse of {@link paddlePriceIdForPlanFromConfig}.
 *
 * Paddle webhooks identify the plan only by the price id inside
 * `data.items[].price.id`, so the subscription payload cannot be applied
 * without this direction of the map. Returns `null` for a price id that is not
 * one of ours — an unknown price must never resolve to a plan.
 */
export function planForPaddlePriceIdFromConfig(
  config: PaddleConfig,
  priceId: string | null | undefined,
): { planCode: Exclude<PlanSlug, "trial">; billingCycle: BillingCycle } | null {
  if (!priceId) return null;

  const table: Array<[string | undefined, Exclude<PlanSlug, "trial">, BillingCycle]> = [
    [config.prices.starterMonthly, "start", "monthly"],
    [config.prices.starterYearly, "start", "yearly"],
    [config.prices.proMonthly, "pro", "monthly"],
    [config.prices.proYearly, "pro", "yearly"],
    [config.prices.businessMonthly, "business", "monthly"],
    [config.prices.businessYearly, "business", "yearly"],
  ];

  for (const [configured, planCode, billingCycle] of table) {
    if (configured && configured === priceId) return { planCode, billingCycle };
  }
  return null;
}

export function paddlePriceIdForPlanFromConfig(
  config: PaddleConfig,
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
