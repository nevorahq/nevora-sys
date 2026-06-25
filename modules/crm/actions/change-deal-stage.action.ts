"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { changeDealStageSchema } from "../schemas/crm.schemas";
import { ROUTES } from "@/shared/config/routes";

export async function changeDealStageAction(
  dealId: string,
  stageId: string,
): Promise<{ error?: string }> {
  const { user, org } = await requireOrg();

  const parsed = changeDealStageSchema.safeParse({ dealId, stageId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  try {
    const supabase = await createClient();

    // Fetch deal + new stage in parallel
    const [dealRes, stageRes] = await Promise.all([
      supabase
        .from("crm_deals")
        .select("id, title, stage_id, status, pipeline_id")
        .eq("id", parsed.data.dealId)
        .eq("organization_id", org.id)
        .single(),
      supabase
        .from("crm_pipeline_stages")
        .select("id, name, stage_type, pipeline_id")
        .eq("id", parsed.data.stageId)
        .eq("organization_id", org.id)
        .single(),
    ]);

    if (!dealRes.data) return { error: "Deal not found" };
    if (!stageRes.data) return { error: "Stage not found" };
    if (dealRes.data.pipeline_id !== stageRes.data.pipeline_id) {
      return { error: "Stage does not belong to deal's pipeline" };
    }

    const deal = dealRes.data;
    const newStage = stageRes.data;
    const oldStageId = deal.stage_id;

    if (oldStageId === parsed.data.stageId) return {};

    const { error } = await supabase
      .from("crm_deals")
      .update({ stage_id: parsed.data.stageId, updated_by: user.id })
      .eq("id", parsed.data.dealId)
      .eq("organization_id", org.id);

    if (error) {
      console.error("changeDealStage error:", error);
      return { error: "Failed to change stage" };
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        eventName:      "deal.stage_changed",
        aggregateType:  "deal",
        aggregateId:    deal.id,
        payload: {
          title:     deal.title,
          old_stage: oldStageId,
          new_stage: parsed.data.stageId,
        },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "crm_deals",
        entityId:       deal.id,
        action:         "stage_change",
        oldData:        { stage_id: oldStageId },
        newData:        { stage_id: parsed.data.stageId, stage_name: newStage.name },
        metadata:       { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("changeDealStage unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.crm);
  return {};
}
