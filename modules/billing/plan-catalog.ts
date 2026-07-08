import type { PlanSlug } from "./constants/billing.constants";
import type { BillingEntitlementKey, BillingLimitKey } from "./services/usage-keys";
import {
  commercialFeatureKeys,
  commercialPlanKeys,
  commercialUsageMetricKeys,
  type CommercialFeatureKey,
  type CommercialPlanKey,
  type CommercialUsageMetricKey,
} from "./plan-catalog.schema";

export interface CommercialPlanCatalogEntry {
  key: CommercialPlanKey;
  planSlug: PlanSlug;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  recommended: boolean;
  checkoutEnabled: boolean;
  contactSales: boolean;
  featureKeys: readonly CommercialFeatureKey[];
  usageLimits: Record<CommercialUsageMetricKey, number | null>;
  upgradeValue: string;
}

export const commercialPlanCatalog = {
  free: {
    key: "free",
    planSlug: "trial",
    name: "Free",
    description: "Validate the workspace with the core workflow and honest limits.",
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: "USD",
    recommended: false,
    checkoutEnabled: false,
    contactSales: false,
    featureKeys: commercialFeatureKeys,
    usageLimits: {
      documents_processed_monthly: 25,
      ai_suggestions_monthly: 20,
      team_members_count: 2,
      storage_used_bytes: 500 * 1024 * 1024,
      automation_runs_monthly: 50,
    },
    upgradeValue: "Keep working after the trial with higher monthly limits.",
  },
  starter: {
    key: "starter",
    planSlug: "start",
    name: "Starter",
    description: "For solo operators and very small teams.",
    monthlyPrice: 9,
    yearlyPrice: 108,
    currency: "USD",
    recommended: false,
    checkoutEnabled: true,
    contactSales: false,
    featureKeys: commercialFeatureKeys,
    usageLimits: {
      documents_processed_monthly: 100,
      ai_suggestions_monthly: 50,
      team_members_count: 3,
      storage_used_bytes: 1024 * 1024 * 1024,
      automation_runs_monthly: 250,
    },
    upgradeValue: "More room for documents, AI suggestions, team seats, and automations.",
  },
  pro: {
    key: "pro",
    planSlug: "pro",
    name: "Pro",
    description: "For small teams that need stronger workflow capacity.",
    monthlyPrice: 29,
    yearlyPrice: 348,
    currency: "USD",
    recommended: true,
    checkoutEnabled: true,
    contactSales: false,
    featureKeys: commercialFeatureKeys,
    usageLimits: {
      documents_processed_monthly: 1000,
      ai_suggestions_monthly: 500,
      team_members_count: 10,
      storage_used_bytes: 10 * 1024 * 1024 * 1024,
      automation_runs_monthly: 2500,
    },
    upgradeValue: "Unlock team-scale document processing, AI review, and automation volume.",
  },
  business: {
    key: "business",
    planSlug: "business",
    name: "Business",
    description: "For teams that need higher limits and operational control.",
    monthlyPrice: 69,
    yearlyPrice: 828,
    currency: "USD",
    recommended: false,
    checkoutEnabled: true,
    contactSales: true,
    featureKeys: commercialFeatureKeys,
    usageLimits: {
      documents_processed_monthly: null,
      ai_suggestions_monthly: null,
      team_members_count: null,
      storage_used_bytes: null,
      automation_runs_monthly: null,
    },
    upgradeValue: "Move critical operations to unlimited usage with priority support.",
  },
} as const satisfies Record<CommercialPlanKey, CommercialPlanCatalogEntry>;

export const commercialPlans = commercialPlanKeys.map((key) => commercialPlanCatalog[key]);

export const featureKeyToEntitlementKey: Record<CommercialFeatureKey, BillingEntitlementKey> = {
  "documents.upload": "documents.upload",
  "documents.process": "documents.process",
  "ai.suggestions.generate": "ai.suggestions.generate",
  "team.members.invite": "team.members.invite",
  "storage.files.upload": "storage.files.upload",
  "automations.run": "automations.run",
};

export const usageMetricToLimitKey: Record<CommercialUsageMetricKey, BillingLimitKey> = {
  documents_processed_monthly: "documents_processed.monthly",
  ai_suggestions_monthly: "ai_suggestions.monthly",
  team_members_count: "members.count",
  storage_used_bytes: "storage.bytes",
  automation_runs_monthly: "automation_runs.monthly",
};

export const commercialFeatureLabels: Record<CommercialFeatureKey, string> = {
  "documents.upload": "Upload documents",
  "documents.process": "Process documents",
  "ai.suggestions.generate": "Generate AI suggestions",
  "team.members.invite": "Invite team members",
  "storage.files.upload": "Upload files",
  "automations.run": "Run automations",
};

export const commercialUsageLabels: Record<CommercialUsageMetricKey, string> = {
  documents_processed_monthly: "Documents processed",
  ai_suggestions_monthly: "AI suggestions",
  team_members_count: "Team members",
  storage_used_bytes: "Storage",
  automation_runs_monthly: "Automation runs",
};

export function planKeyForSlug(slug: PlanSlug | string | null | undefined): CommercialPlanKey {
  if (slug === "start") return "starter";
  if (slug === "pro" || slug === "business") return slug;
  return "free";
}

export function nextCommercialPlanKey(current: CommercialPlanKey): CommercialPlanKey {
  if (current === "free") return "starter";
  if (current === "starter") return "pro";
  return "business";
}

export function formatCommercialLimit(metric: CommercialUsageMetricKey, value: number | null): string {
  if (value === null) return "Unlimited";
  if (metric === "storage_used_bytes") {
    if (value >= 1024 * 1024 * 1024) return `${Math.round(value / 1024 / 1024 / 1024)} GB`;
    return `${Math.round(value / 1024 / 1024)} MB`;
  }
  return new Intl.NumberFormat("en").format(value);
}

export function assertCatalogConsistency(): void {
  for (const plan of commercialPlans) {
    for (const featureKey of commercialFeatureKeys) {
      if (!plan.featureKeys.includes(featureKey)) {
        throw new Error(`Plan ${plan.key} is missing feature ${featureKey}.`);
      }
    }
    for (const metricKey of commercialUsageMetricKeys) {
      if (!(metricKey in plan.usageLimits)) {
        throw new Error(`Plan ${plan.key} is missing usage metric ${metricKey}.`);
      }
    }
  }
}
