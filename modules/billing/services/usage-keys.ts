import type { Plan } from "../types/billing.types";

export const BILLING_LIMIT_KEYS = [
  "members.count",
  "tasks.count",
  "documents.count",
  "documents_processed.monthly",
  "subscriptions.count",
  "money_transactions.count",
  "storage.bytes",
  "ai_suggestions.monthly",
  "ai_requests.monthly",
  "automation_runs.monthly",
  "api_requests.monthly",
  "api_requests.minute",
  "developer_api_keys.count",
  "developer_webhooks.count",
] as const;

export type BillingLimitKey = (typeof BILLING_LIMIT_KEYS)[number];

export const BILLING_ENTITLEMENT_KEYS = [
  "tasks.enabled",
  "documents.enabled",
  "documents.upload",
  "documents.process",
  "money.enabled",
  "subscriptions.enabled",
  "analytics.enabled",
  "ai.enabled",
  "ai.suggestions.generate",
  "team.members.invite",
  "storage.files.upload",
  "automations.run",
  "developer_access.enabled",
  "public_api.enabled",
  "developer_webhooks.enabled",
] as const;

export type BillingEntitlementKey = (typeof BILLING_ENTITLEMENT_KEYS)[number];

export type LimitPeriod = "lifetime" | "monthly" | "daily" | "minute";

export function megabytesToBytes(megabytes: number): number {
  return megabytes * 1024 * 1024;
}

export function defaultPeriodForLimit(key: BillingLimitKey): LimitPeriod {
  if (key.endsWith(".monthly")) return "monthly";
  if (key.endsWith(".minute")) return "minute";
  return "lifetime";
}

export function legacyPlanLimit(plan: Plan, key: BillingLimitKey): number | null | undefined {
  const normalize = (value: number | undefined) =>
    value === undefined ? undefined : value === -1 ? null : value;

  switch (key) {
    case "members.count":
      return normalize(plan.max_members);
    case "tasks.count":
      return normalize(plan.max_tasks);
    case "documents.count":
      return normalize(plan.max_documents);
    case "documents_processed.monthly":
      return normalize(plan.max_documents);
    case "subscriptions.count":
      return normalize(plan.max_subscriptions);
    case "money_transactions.count":
      return normalize(plan.max_money_transactions);
    case "storage.bytes": {
      const limit = normalize(plan.max_storage_mb);
      return limit === null || limit === undefined ? limit : megabytesToBytes(limit);
    }
    case "ai_requests.monthly":
      return normalize(plan.max_ai_calls_mo);
    case "ai_suggestions.monthly":
      return normalize(plan.max_ai_calls_mo);
    case "automation_runs.monthly":
      return undefined;
    default:
      return undefined;
  }
}

export function currentPeriodWindow(period: LimitPeriod, now = new Date()) {
  if (period === "monthly") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { start, end };
  }

  if (period === "daily") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  if (period === "minute") {
    const start = new Date(now);
    start.setUTCSeconds(0, 0);
    const end = new Date(start);
    end.setUTCMinutes(end.getUTCMinutes() + 1);
    return { start, end };
  }

  return { start: null, end: null };
}
