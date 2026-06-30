import { createClient } from "@/lib/supabase/server";
import type { DashboardMetrics } from "../types/analytics.types";

export async function getDashboardMetrics(
  organizationId: string,
  days = 30,
): Promise<DashboardMetrics> {
  const supabase = await createClient();
  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - days);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(now);
  monthStart.setDate(monthStart.getDate() - 30);

  const periodStartISO = periodStart.toISOString();
  const todayISO       = todayStart.toISOString();
  const weekISO        = weekStart.toISOString();
  const monthISO       = monthStart.toISOString();

  const [
    tasksAll,
    crmClientsAll,
    crmClientsNew,
    dealsAll,
    docsAll,
    eventsToday,
    eventsWeek,
    eventsMonth,
  ] = await Promise.all([
    // Tasks
    supabase
      .from("todos")
      .select("status, is_completed, due_date")
      .eq("organization_id", organizationId)
      .is("deleted_at", null),

    // CRM clients total
    supabase
      .from("crm_clients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null),

    // CRM clients new (за period)
    supabase
      .from("crm_clients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .gte("created_at", periodStartISO),

    // CRM deals
    supabase
      .from("crm_deals")
      .select("status, value")
      .eq("organization_id", organizationId)
      .is("deleted_at", null),

    // Documents
    supabase
      .from("documents")
      .select("status")
      .eq("organization_id", organizationId)
      .is("deleted_at", null),

    // Events today
    supabase
      .from("domain_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", todayISO),

    // Events this week
    supabase
      .from("domain_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", weekISO),

    // Events this month
    supabase
      .from("domain_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", monthISO),
  ]);

  // Tasks
  const tasks = tasksAll.data ?? [];
  const tasksTotal     = tasks.length;
  // status — источник истины: done = завершена, остальное = активна.
  const tasksCompleted = tasks.filter((t) => t.status === "done").length;
  const tasksActive    = tasks.filter((t) => t.status !== "done").length;
  const tasksOverdue = tasks.filter(
    (t) =>
      t.status !== "done" &&
      t.due_date != null &&
      new Date(t.due_date) < now,
  ).length;
  const tasksDueToday = tasks.filter(
    (t) =>
      t.status !== "done" &&
      t.due_date != null &&
      new Date(t.due_date) >= todayStart &&
      new Date(t.due_date) < new Date(todayStart.getTime() + 86400_000),
  ).length;
  const completionRate =
    tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

  // CRM deals
  const deals = dealsAll.data ?? [];
  const dealsOpen = deals.filter((d) => d.status === "open").length;
  const dealsWon  = deals.filter((d) => d.status === "won").length;
  const dealsLost = deals.filter((d) => d.status === "lost").length;
  const revenueWon = deals
    .filter((d) => d.status === "won")
    .reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  const totalClosed = dealsWon + dealsLost;
  const winRate = totalClosed > 0 ? Math.round((dealsWon / totalClosed) * 100) : 0;

  // Documents
  const docs = docsAll.data ?? [];
  const docsPublished = docs.filter((d) => d.status === "published").length;
  const docsDrafts    = docs.filter((d) => d.status === "draft").length;
  const docsArchived  = docs.filter((d) => d.status === "archived").length;

  return {
    tasks: {
      total:          tasksTotal,
      active:         tasksActive,
      completed:      tasksCompleted,
      overdue:        tasksOverdue,
      dueToday:       tasksDueToday,
      completionRate,
    },
    crm: {
      clientsTotal: crmClientsAll.count ?? 0,
      clientsNew:   crmClientsNew.count ?? 0,
      dealsOpen,
      dealsWon,
      dealsLost,
      revenueWon,
      winRate,
    },
    documents: {
      total:     docs.length,
      published: docsPublished,
      drafts:    docsDrafts,
      archived:  docsArchived,
    },
    activity: {
      eventsToday:     eventsToday.count ?? 0,
      eventsThisWeek:  eventsWeek.count ?? 0,
      eventsThisMonth: eventsMonth.count ?? 0,
    },
  };
}
