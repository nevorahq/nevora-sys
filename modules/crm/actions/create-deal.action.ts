"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { checkPlanLimit } from "@/lib/billing";
import { createDealSchema } from "../schemas/crm.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function createDealAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, org, workspace } = await requireOrg();

  const limitCheck = await checkPlanLimit(org.id, "deals");
  if (!limitCheck.allowed) {
    return { error: limitCheck.reason ?? "Plan limit reached. Upgrade your plan." };
  }

  const rawData = {
    title:               formData.get("title") as string,
    pipeline_id:         formData.get("pipeline_id") as string,
    stage_id:            formData.get("stage_id") as string,
    client_id:           (formData.get("client_id") as string) || null,
    value:               (formData.get("value") as string) || null,
    currency:            (formData.get("currency") as string) || "USD",
    expected_close_date: (formData.get("expected_close_date") as string) || null,
    assigned_to:         (formData.get("assigned_to") as string) || null,
  };

  const parsed = createDealSchema.safeParse(rawData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  // Verify pipeline belongs to org
  try {
    const supabase = await createClient();

    const { data: stage } = await supabase
      .from("crm_pipeline_stages")
      .select("id, pipeline_id")
      .eq("id", parsed.data.stage_id)
      .eq("organization_id", org.id)
      .eq("pipeline_id", parsed.data.pipeline_id)
      .single();

    if (!stage) return { error: "Invalid pipeline or stage" };

    const { data: newDeal, error } = await supabase
      .from("crm_deals")
      .insert({
        organization_id: org.id,
        workspace_id:    workspace.id,
        created_by:      user.id,
        updated_by:      user.id,
        ...parsed.data,
      })
      .select("id")
      .single();

    if (error || !newDeal) {
      console.error("createDeal error:", error);
      return { error: "Failed to create deal" };
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        workspaceId:    workspace.id,
        eventName:      "deal.created",
        aggregateType:  "deal",
        aggregateId:    newDeal.id,
        payload: {
          title:    parsed.data.title,
          value:    parsed.data.value ?? null,
          currency: parsed.data.currency,
        },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "crm_deals",
        entityId:       newDeal.id,
        action:         "create",
        newData:        { title: parsed.data.title, value: parsed.data.value },
        metadata:       { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("createDeal unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.crm);
  return {};
}
