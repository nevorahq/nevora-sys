import { createClient } from "@/lib/supabase/server";
import type { AnalyticsSnapshot } from "../types/analytics.types";
import type { PeriodType } from "../constants/analytics.constants";

export interface GetSnapshotsOptions {
  periodType?: PeriodType;
  limit?: number;
  fromDate?: string;
}

export async function getSnapshots(
  organizationId: string,
  options: GetSnapshotsOptions = {},
): Promise<AnalyticsSnapshot[]> {
  const { periodType = "daily", limit = 30, fromDate } = options;
  const supabase = await createClient();

  let query = supabase
    .from("analytics_snapshots")
    .select(
      "id, organization_id, workspace_id, snapshot_date, period_type, " +
      "tasks_total, tasks_active, tasks_completed, tasks_overdue, " +
      "crm_clients_total, crm_clients_new, crm_deals_open, crm_deals_won, crm_deals_lost, crm_revenue_won, " +
      "docs_total, docs_published, docs_drafts, events_total, metadata, created_at",
    )
    .eq("organization_id", organizationId)
    .eq("period_type", periodType)
    .order("snapshot_date", { ascending: false })
    .limit(limit);

  if (fromDate) {
    query = query.gte("snapshot_date", fromDate);
  }

  const { data, error } = await query;
  if (error) {
    console.error("getSnapshots error:", error);
    return [];
  }
  return (data ?? []) as unknown as AnalyticsSnapshot[];
}
