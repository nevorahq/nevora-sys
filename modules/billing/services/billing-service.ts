import "server-only";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/observability/logger";
import type { Plan, SubscriptionWithPlan } from "../types/billing.types";
import {
  PlanEntitlementRequiredError,
  PlanLimitExceededError,
  SubscriptionExpiredError,
} from "../errors/billing.errors";
import {
  currentPeriodWindow,
  defaultPeriodForLimit,
  legacyPlanLimit,
  type BillingEntitlementKey,
  type BillingLimitKey,
  type LimitPeriod,
} from "./usage-keys";

export interface PlanLimit {
  key: BillingLimitKey;
  value: number | null;
  period: LimitPeriod;
  planCode: string;
}

export interface UsageValue {
  key: BillingLimitKey;
  value: number;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

function planCode(plan: Pick<Plan, "slug" | "code">): string {
  return plan.code ?? plan.slug;
}

export async function getOrganizationSubscription(
  organizationId: string,
): Promise<SubscriptionWithPlan | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("billing_subscriptions")
    .select(
      "id, organization_id, plan_id, status, billing_cycle, " +
        "trial_ends_at, current_period_start, current_period_end, " +
        "canceled_at, cancel_at_period_end, external_id, metadata, created_at, updated_at, " +
        "billing_provider, provider_customer_id, provider_subscription_id, trial_start, trial_end, " +
        "plan:plans!plan_id(" +
          "id, slug, code, name, description, price_monthly, price_yearly, currency, is_active, sort_order, " +
          "max_members, max_workspaces, max_tasks, max_deals, max_clients, " +
          "max_documents, max_subscriptions, max_money_transactions, max_ai_calls_mo, max_storage_mb, " +
          "included_members, extra_member_price, features, created_at, updated_at" +
        ")",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("getOrganizationSubscription error:", error);
    return null;
  }

  return data as unknown as SubscriptionWithPlan | null;
}

export async function getOrganizationPlan(organizationId: string): Promise<Plan | null> {
  const subscription = await getOrganizationSubscription(organizationId);
  return subscription?.plan ?? null;
}

export async function getPlanEntitlement(
  organizationId: string,
  key: BillingEntitlementKey,
): Promise<{ key: BillingEntitlementKey; value: unknown; planCode: string } | null> {
  const plan = await getOrganizationPlan(organizationId);
  if (!plan) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_entitlements")
    .select("key, value")
    .eq("plan_id", plan.id)
    .eq("key", key)
    .maybeSingle();

  const features = plan.features ?? {};
  return {
    key,
    value: (data as { value?: unknown } | null)?.value ?? features[key] ?? false,
    planCode: planCode(plan),
  };
}

export async function getPlanLimit(
  organizationId: string,
  key: BillingLimitKey,
): Promise<PlanLimit | null> {
  const plan = await getOrganizationPlan(organizationId);
  if (!plan) return null;

  const period = defaultPeriodForLimit(key);
  const supabase = await createClient();
  const { data } = await supabase
    .from("plan_limits")
    .select("value, period")
    .eq("plan_id", plan.id)
    .eq("key", key)
    .eq("period", period)
    .maybeSingle();

  const row = data as { value: number | string | null; period: LimitPeriod } | null;
  const value = row
    ? row.value === null
      ? null
      : Number(row.value)
    : legacyPlanLimit(plan, key);

  if (value === undefined) return null;

  return {
    key,
    value,
    period,
    planCode: planCode(plan),
  };
}

async function countRows(
  supabase: Supabase,
  table: string,
  organizationId: string,
  deletedAware = false,
): Promise<number> {
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (deletedAware) query = query.is("deleted_at", null) as typeof query;

  const { count } = await query;
  return count ?? 0;
}

export async function getUsage(
  organizationId: string,
  key: BillingLimitKey,
): Promise<UsageValue> {
  const supabase = await createClient();

  if (key === "members.count") {
    const { count } = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["active", "invited"]);
    return { key, value: count ?? 0 };
  }

  if (key === "tasks.count") {
    return { key, value: await countRows(supabase, "todos", organizationId, true) };
  }

  if (key === "documents.count") {
    return { key, value: await countRows(supabase, "documents", organizationId, true) };
  }

  if (key === "subscriptions.count") {
    return { key, value: await countRows(supabase, "subscriptions", organizationId) };
  }

  if (key === "money_transactions.count") {
    return { key, value: await countRows(supabase, "money_transactions", organizationId, true) };
  }

  if (key === "developer_api_keys.count") {
    const { count } = await supabase
      .from("developer_api_keys")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("revoked_at", null);
    return { key, value: count ?? 0 };
  }

  if (key === "developer_webhooks.count") {
    const { count } = await supabase
      .from("developer_webhooks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("is_active", true);
    return { key, value: count ?? 0 };
  }

  if (key === "storage.bytes") {
    const { data } = await supabase
      .from("document_attachments")
      .select("file_size")
      .eq("organization_id", organizationId);
    const value = ((data ?? []) as { file_size: number | null }[]).reduce(
      (total, row) => total + (row.file_size ?? 0),
      0,
    );
    return { key, value };
  }

  if (key === "ai_requests.monthly") {
    const { start } = currentPeriodWindow("monthly");
    const { count } = await supabase
      .from("ai_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", start?.toISOString() ?? new Date(0).toISOString());
    return { key, value: count ?? 0 };
  }

  const period = key.endsWith(".minute") ? "minute" : "monthly";
  const { start } = currentPeriodWindow(period);
  const { data } = await supabase
    .from("organization_usage_counters")
    .select("value")
    .eq("organization_id", organizationId)
    .eq("key", key)
    .eq("period_start", start?.toISOString() ?? null)
    .maybeSingle();

  return { key, value: Number((data as { value?: number | string } | null)?.value ?? 0) };
}

export async function assertPlanEntitlement(
  organizationId: string,
  key: BillingEntitlementKey,
): Promise<void> {
  const entitlement = await getPlanEntitlement(organizationId, key);
  const allowed = entitlement?.value === true;
  if (allowed) return;

  throw new PlanEntitlementRequiredError({
    key,
    currentUsage: 0,
    limit: null,
    planCode: entitlement?.planCode ?? "unknown",
    message: `Your current plan does not include ${key}.`,
  });
}

export async function assertPlanLimit(
  organizationId: string,
  key: BillingLimitKey,
  incrementBy = 1,
): Promise<void> {
  const [limit, usage] = await Promise.all([
    getPlanLimit(organizationId, key),
    getUsage(organizationId, key),
  ]);

  if (!limit || limit.value === null) return;

  if (usage.value + incrementBy > limit.value) {
    throw new PlanLimitExceededError({
      key,
      currentUsage: usage.value,
      limit: limit.value,
      planCode: limit.planCode,
      message: `You have reached the ${key} limit for the ${limit.planCode} plan: ${usage.value} / ${limit.value}. Upgrade to continue.`,
    });
  }
}

export async function incrementUsage(
  organizationId: string,
  key: BillingLimitKey,
  incrementBy = 1,
): Promise<number> {
  const period = defaultPeriodForLimit(key);
  const { start, end } = currentPeriodWindow(period);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("increment_organization_usage_counter", {
    p_organization_id: organizationId,
    p_key: key,
    p_increment: incrementBy,
    p_period_start: start?.toISOString() ?? null,
    p_period_end: end?.toISOString() ?? null,
  });

  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** Human labels for usage keys — limit-reached copy reads better than `tasks.count`. */
const USAGE_KEY_LABELS: Record<string, string> = {
  "tasks.count": "task",
  "documents.count": "document",
  "money_transactions.count": "transaction",
  "subscriptions.count": "subscription",
  "developer_api_keys.count": "API key",
  "developer_webhooks.count": "webhook",
};

/**
 * Builds the §7.9 "critical copy" limit message: which limit, current usage,
 * plan limit, and the next step. Parses `current=/limit=` from the RPC DETAIL
 * (`plan_limit_exceeded` raises `key=… current=… limit=…`); falls back to a
 * generic-but-friendly line if the detail is unavailable.
 */
export function limitReachedMessage(
  key: string,
  error: { message?: string; details?: string | null },
): string {
  const label = USAGE_KEY_LABELS[key] ?? key;
  const source = `${error.details ?? ""} ${error.message ?? ""}`;
  const current = source.match(/current=(\d+(?:\.\d+)?)/);
  const limit = source.match(/limit=(\d+(?:\.\d+)?)/);
  if (current && limit) {
    return `You've reached your plan's ${label} limit — ${current[1]} of ${limit[1]} used. Upgrade your plan to add more.`;
  }
  return `You've reached your plan's ${label} limit. Upgrade your plan to add more.`;
}

export async function reserveOrganizationUsage(
  organizationId: string,
  key: Extract<
    BillingLimitKey,
    | "tasks.count"
    | "documents.count"
    | "money_transactions.count"
    | "subscriptions.count"
    | "developer_api_keys.count"
    | "developer_webhooks.count"
  >,
  incrementBy = 1,
): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reserve_organization_usage", {
    p_organization_id: organizationId,
    p_key: key,
    p_increment: incrementBy,
  });

  if (error) {
    // Expected denials (limit reached / not writable) are warn-level business
    // signals; anything else is an unexpected reservation failure (Phase 7.5).
    if (error.message.includes("plan_limit_exceeded")) {
      logger.warn("billing.reserve.denied", { organizationId, key, reason: "plan_limit_exceeded" });
      throw new Error(limitReachedMessage(key, error));
    }
    if (error.message.includes("subscription_not_writable")) {
      logger.warn("billing.reserve.denied", { organizationId, key, reason: "subscription_not_writable" });
      throw new Error("Your trial or subscription no longer allows write actions. Reads remain available.");
    }
    logger.error("billing.reserve.failed", { organizationId, key, error: error.message });
    throw new Error(error.message);
  }

  return Number(data ?? 0);
}

export async function releaseOrganizationUsage(
  organizationId: string,
  key: Extract<
    BillingLimitKey,
    | "tasks.count"
    | "documents.count"
    | "money_transactions.count"
    | "subscriptions.count"
    | "developer_api_keys.count"
    | "developer_webhooks.count"
  >,
  decrementBy = 1,
): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("release_organization_usage", {
    p_organization_id: organizationId,
    p_key: key,
    p_decrement: decrementBy,
  });

  if (error) {
    // A failed release means the counter stays inflated (drifts a seat/slot out
    // of reach). Always surface it — this is a correctness signal (Phase 7.5).
    logger.error("billing.release.failed", { organizationId, key, error: error.message });
    throw new Error(error.message);
  }
  return Number(data ?? 0);
}

export async function decrementUsage(
  organizationId: string,
  key: BillingLimitKey,
  decrementBy = 1,
): Promise<void> {
  const period = defaultPeriodForLimit(key);
  const { start } = currentPeriodWindow(period);
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_usage_counters")
    .select("id, value")
    .eq("organization_id", organizationId)
    .eq("key", key)
    .eq("period_start", start?.toISOString() ?? null)
    .maybeSingle();

  const row = data as { id: string; value: number | string } | null;
  if (!row) return;

  await supabase
    .from("organization_usage_counters")
    .update({ value: Math.max(Number(row.value) - decrementBy, 0) })
    .eq("id", row.id);
}

export async function recalculateOrganizationUsage(
  organizationId: string,
): Promise<Record<BillingLimitKey, number>> {
  const keys: BillingLimitKey[] = [
    "members.count",
    "tasks.count",
    "documents.count",
    "subscriptions.count",
    "money_transactions.count",
    "storage.bytes",
    "ai_requests.monthly",
    "api_requests.monthly",
    "developer_api_keys.count",
    "developer_webhooks.count",
  ];

  const entries = await Promise.all(keys.map(async (key) => [key, (await getUsage(organizationId, key)).value] as const));
  return Object.fromEntries(entries) as Record<BillingLimitKey, number>;
}

export async function assertSubscriptionWritable(organizationId: string): Promise<void> {
  const [subscription, supabase] = await Promise.all([
    getOrganizationSubscription(organizationId),
    createClient(),
  ]);

  const { data: writable } = await supabase.rpc("is_organization_writable", {
    p_organization_id: organizationId,
  });

  if (writable !== false) return;

  throw new SubscriptionExpiredError({
    key: "subscription.status",
    currentUsage: 0,
    limit: null,
    planCode: subscription?.plan ? planCode(subscription.plan) : "unknown",
    message: "Your trial or subscription no longer allows write actions. Reads remain available.",
  });
}
