"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { createReportSchema } from "../schemas/analytics.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function createReportAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, org, workspace } = await requireOrg();

  const rawData = {
    name:        formData.get("name") as string,
    description: (formData.get("description") as string) || undefined,
    reportType:  formData.get("reportType") as string,
    parameters:  (() => {
      try { return JSON.parse(formData.get("parameters") as string); } catch { return {}; }
    })(),
  };

  const parsed = createReportSchema.safeParse(rawData);
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

    const { data: report, error } = await supabase
      .from("analytics_reports")
      .insert({
        organization_id: org.id,
        created_by:      user.id,
        name:            parsed.data.name,
        description:     parsed.data.description ?? null,
        report_type:     parsed.data.reportType,
        parameters:      parsed.data.parameters,
      })
      .select("id")
      .single();

    if (error || !report) {
      console.error("createReport error:", error);
      return { error: "Failed to create report" };
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        workspaceId:    workspace.id,
        eventName:      "report.created",
        aggregateType:  "report",
        aggregateId:    report.id,
        payload: {
          name:        parsed.data.name,
          report_type: parsed.data.reportType,
        },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "analytics_reports",
        entityId:       report.id,
        action:         "create",
        newData:        { name: parsed.data.name, report_type: parsed.data.reportType },
        metadata:       { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("createReport unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.analytics);
  return {};
}
