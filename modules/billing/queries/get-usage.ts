import { createClient } from "@/lib/supabase/server";
import type { UsageSummary } from "../types/billing.types";
import type { Plan } from "../types/billing.types";
import { USAGE_METRICS, UNLIMITED } from "../constants/billing.constants";
import type { UsageMetric } from "../constants/billing.constants";

// Текущее реальное использование — считается live из таблиц
async function fetchLiveUsage(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  organizationId: string,
): Promise<Record<UsageMetric, number>> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    members, workspaces, tasks, deals, clients, documents,
    subscriptions, moneyTransactions,
    aiRequests, attachments,
  ] =
    await Promise.all([
      supabase
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .in("status", ["active", "invited"]),

      supabase
        .from("workspaces")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId),

      supabase
        .from("todos")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("deleted_at", null),

      supabase
        .from("crm_deals")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("deleted_at", null),

      supabase
        .from("crm_clients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("deleted_at", null),

      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("deleted_at", null),

      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId),

      supabase
        .from("money_transactions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId),

      supabase
        .from("ai_requests")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", monthStart.toISOString()),

      supabase
        .from("document_attachments")
        .select("file_size")
        .eq("organization_id", organizationId),
    ]);

  return {
    members:            members.count           ?? 0,
    workspaces:         workspaces.count        ?? 0,
    tasks:              tasks.count             ?? 0,
    deals:              deals.count             ?? 0,
    clients:            clients.count           ?? 0,
    documents:          documents.count         ?? 0,
    subscriptions:      subscriptions.count     ?? 0,
    money_transactions: moneyTransactions.count ?? 0,
    ai_calls:           aiRequests.count        ?? 0,
    storage_mb: Math.ceil(
      ((attachments.data ?? []) as { file_size: number | null }[]).reduce(
        (s, r) => s + (r.file_size ?? 0),
        0,
      ) /
        (1024 * 1024),
    ),
  };
}

const PLAN_LIMIT_MAP: Record<UsageMetric, keyof Plan> = {
  members:            "max_members",
  workspaces:         "max_workspaces",
  tasks:              "max_tasks",
  deals:              "max_deals",
  clients:            "max_clients",
  documents:          "max_documents",
  subscriptions:      "max_subscriptions",
  money_transactions: "max_money_transactions",
  ai_calls:           "max_ai_calls_mo",
  storage_mb:         "max_storage_mb",
};

export async function getUsageSummary(
  organizationId: string,
  plan: Plan,
): Promise<UsageSummary[]> {
  const supabase = await createClient();
  const liveUsage = await fetchLiveUsage(supabase, organizationId);

  return USAGE_METRICS.map((metric) => {
    const used  = liveUsage[metric];
    const limit = plan[PLAN_LIMIT_MAP[metric]] as number;

    const isUnlimited = limit === UNLIMITED;
    const pct = isUnlimited
      ? UNLIMITED
      : limit > 0
      ? Math.min(Math.round((used / limit) * 100), 100)
      : 0;

    return {
      metric,
      used,
      limit,
      pct,
      isOverLimit: !isUnlimited && used > limit,
    };
  });
}
