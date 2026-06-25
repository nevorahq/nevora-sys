"use server";

import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { createSnapshotSchema } from "../schemas/analytics.schemas";
import { getDashboardMetrics } from "../queries/get-dashboard-metrics";
import type { ActionResult } from "@/lib/validators/common";

export async function createSnapshotAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { org, workspace, membership } = await requireOrg();

  if (!["admin", "owner"].includes(membership.roleId)) {
    return { error: "Only admins can create snapshots" };
  }

  const rawData = {
    snapshotDate: formData.get("snapshotDate") as string,
    periodType:   formData.get("periodType") as string,
    workspaceId:  (formData.get("workspaceId") as string) || undefined,
  };

  const parsed = createSnapshotSchema.safeParse(rawData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  try {
    const supabase = await createClient();
    const metrics  = await getDashboardMetrics(org.id);

    const { data: snapshot, error } = await supabase
      .from("analytics_snapshots")
      .upsert(
        {
          organization_id: org.id,
          workspace_id:    parsed.data.workspaceId ?? null,
          snapshot_date:   parsed.data.snapshotDate,
          period_type:     parsed.data.periodType,

          tasks_total:     metrics.tasks.total,
          tasks_active:    metrics.tasks.active,
          tasks_completed: metrics.tasks.completed,
          tasks_overdue:   metrics.tasks.overdue,

          crm_clients_total: metrics.crm.clientsTotal,
          crm_clients_new:   metrics.crm.clientsNew,
          crm_deals_open:    metrics.crm.dealsOpen,
          crm_deals_won:     metrics.crm.dealsWon,
          crm_deals_lost:    metrics.crm.dealsLost,
          crm_revenue_won:   metrics.crm.revenueWon,

          docs_total:     metrics.documents.total,
          docs_published: metrics.documents.published,
          docs_drafts:    metrics.documents.drafts,

          events_total:   metrics.activity.eventsThisMonth,
          metadata:       { generated_at: new Date().toISOString() },
        },
        {
          onConflict:       "organization_id,snapshot_date,period_type",
          ignoreDuplicates: false,
        },
      )
      .select("id")
      .single();

    if (error || !snapshot) {
      console.error("createSnapshot error:", error);
      return { error: "Failed to create snapshot" };
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        workspaceId:    workspace.id,
        eventName:      "snapshot.created",
        aggregateType:  "snapshot",
        aggregateId:    snapshot.id,
        payload: {
          snapshot_date: parsed.data.snapshotDate,
          period_type:   parsed.data.periodType,
        },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "analytics_snapshots",
        entityId:       snapshot.id,
        action:         "create",
        newData:        { snapshot_date: parsed.data.snapshotDate, period_type: parsed.data.periodType },
        metadata:       { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("createSnapshot unexpected error:", err);
    return { error: "Server error" };
  }

  return {};
}
