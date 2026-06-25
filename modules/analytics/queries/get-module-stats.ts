import { createClient } from "@/lib/supabase/server";
import type { ModuleStats } from "../types/analytics.types";

async function getTasksStats(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  organizationId: string,
  days: number,
): Promise<ModuleStats> {
  const now   = new Date();
  const cur   = new Date(now); cur.setDate(cur.getDate() - days);
  const prev  = new Date(cur); prev.setDate(prev.getDate() - days);

  const [current, previous, byStatus] = await Promise.all([
    supabase
      .from("todos")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .gte("created_at", cur.toISOString()),

    supabase
      .from("todos")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .gte("created_at", prev.toISOString())
      .lt("created_at", cur.toISOString()),

    supabase
      .from("todos")
      .select("status")
      .eq("organization_id", organizationId)
      .is("deleted_at", null),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of byStatus.data ?? []) {
    const s = row.status ?? "todo";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const cur_n  = current.count ?? 0;
  const prev_n = previous.count ?? 0;
  const change = cur_n - prev_n;
  const changePct = prev_n > 0 ? Math.round((change / prev_n) * 100) : 0;

  return {
    module:    "tasks",
    periodDays: days,
    current:   cur_n,
    previous:  prev_n,
    change,
    changePct,
    breakdown: Object.entries(statusCounts).map(([label, value]) => ({ label, value })),
  };
}

async function getCrmStats(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  organizationId: string,
  days: number,
): Promise<ModuleStats> {
  const now  = new Date();
  const cur  = new Date(now); cur.setDate(cur.getDate() - days);
  const prev = new Date(cur); prev.setDate(prev.getDate() - days);

  const [current, previous, byStatus] = await Promise.all([
    supabase
      .from("crm_deals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .gte("created_at", cur.toISOString()),

    supabase
      .from("crm_deals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .gte("created_at", prev.toISOString())
      .lt("created_at", cur.toISOString()),

    supabase
      .from("crm_deals")
      .select("status")
      .eq("organization_id", organizationId)
      .is("deleted_at", null),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of byStatus.data ?? []) {
    const s = row.status ?? "open";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const cur_n  = current.count ?? 0;
  const prev_n = previous.count ?? 0;
  const change = cur_n - prev_n;
  const changePct = prev_n > 0 ? Math.round((change / prev_n) * 100) : 0;

  return {
    module:    "crm",
    periodDays: days,
    current:   cur_n,
    previous:  prev_n,
    change,
    changePct,
    breakdown: Object.entries(statusCounts).map(([label, value]) => ({ label, value })),
  };
}

async function getDocumentsStats(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  organizationId: string,
  days: number,
): Promise<ModuleStats> {
  const now  = new Date();
  const cur  = new Date(now); cur.setDate(cur.getDate() - days);
  const prev = new Date(cur); prev.setDate(prev.getDate() - days);

  const [current, previous, byStatus] = await Promise.all([
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .gte("created_at", cur.toISOString()),

    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .gte("created_at", prev.toISOString())
      .lt("created_at", cur.toISOString()),

    supabase
      .from("documents")
      .select("status")
      .eq("organization_id", organizationId)
      .is("deleted_at", null),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of byStatus.data ?? []) {
    const s = row.status ?? "draft";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const cur_n  = current.count ?? 0;
  const prev_n = previous.count ?? 0;
  const change = cur_n - prev_n;
  const changePct = prev_n > 0 ? Math.round((change / prev_n) * 100) : 0;

  return {
    module:    "documents",
    periodDays: days,
    current:   cur_n,
    previous:  prev_n,
    change,
    changePct,
    breakdown: Object.entries(statusCounts).map(([label, value]) => ({ label, value })),
  };
}

export async function getModuleStats(
  organizationId: string,
  days = 30,
): Promise<{ tasks: ModuleStats; crm: ModuleStats; documents: ModuleStats }> {
  const supabase = await createClient();

  const [tasks, crm, documents] = await Promise.all([
    getTasksStats(supabase, organizationId, days),
    getCrmStats(supabase, organizationId, days),
    getDocumentsStats(supabase, organizationId, days),
  ]);

  return { tasks, crm, documents };
}
