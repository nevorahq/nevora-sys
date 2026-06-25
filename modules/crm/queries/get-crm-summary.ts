import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CrmSummary } from "../types/crm.types";

export async function getCrmSummary(orgId: string): Promise<CrmSummary> {
  const supabase = await createClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const todayStr = now.toISOString().split("T")[0];

  const [clientsRes, dealsRes, activitiesRes] = await Promise.all([
    supabase
      .from("crm_clients")
      .select("id, status")
      .eq("organization_id", orgId),

    supabase
      .from("crm_deals")
      .select("id, status, value, won_at")
      .eq("organization_id", orgId),

    supabase
      .from("crm_activities")
      .select("id, completed, scheduled_at")
      .eq("organization_id", orgId)
      .eq("completed", false)
      .not("scheduled_at", "is", null),
  ]);

  const clients = clientsRes.data ?? [];
  const deals   = dealsRes.data ?? [];
  const activities = activitiesRes.data ?? [];

  const totalClients = clients.length;
  const newLeads     = clients.filter((c) => c.status === "lead").length;

  const openDeals      = deals.filter((d) => d.status === "open");
  const openDealsValue = openDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

  const wonThisMonth = deals.filter(
    (d) => d.status === "won" && d.won_at && d.won_at >= monthStart,
  );
  const wonDealsThisMonth = wonThisMonth.length;
  const wonValueThisMonth = wonThisMonth.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

  const activitiesDueToday = activities.filter((a) => {
    if (!a.scheduled_at) return false;
    return a.scheduled_at.startsWith(todayStr);
  }).length;

  return {
    totalClients,
    newLeads,
    openDeals: openDeals.length,
    openDealsValue,
    wonDealsThisMonth,
    wonValueThisMonth,
    activitiesDueToday,
  };
}
