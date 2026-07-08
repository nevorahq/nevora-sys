"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { closeDealSchema } from "../schemas/crm.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { assertPausedModuleAction } from "@/shared/config/paused-modules";

export async function closeDealAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // CRM is paused for the private beta. A "use server" export stays
  // reachable over POST even while its page 404s — gate the mutation itself.
  assertPausedModuleAction("crm");

  const { user, org } = await requireOrg();

  const rawData = {
    dealId:      formData.get("dealId") as string,
    outcome:     formData.get("outcome") as string,
    lost_reason: (formData.get("lost_reason") as string) || null,
  };

  const parsed = closeDealSchema.safeParse(rawData);
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

    // Find terminal stage of correct type
    const [dealRes, stageRes] = await Promise.all([
      supabase
        .from("crm_deals")
        .select("id, title, value, currency, pipeline_id, status")
        .eq("id", parsed.data.dealId)
        .eq("organization_id", org.id)
        .single(),
      // Find won/lost terminal stage
      supabase
        .from("crm_pipeline_stages")
        .select("id")
        .eq("organization_id", org.id)
        .eq("stage_type", parsed.data.outcome)
        .limit(1),
    ]);

    if (!dealRes.data) return { error: "Deal not found" };
    if (dealRes.data.status !== "open") return { error: "Deal is already closed" };

    const deal = dealRes.data;
    const terminalStage = stageRes.data?.[0];

    const now = new Date().toISOString();
    const updatePayload =
      parsed.data.outcome === "won"
        ? { status: "won" as const,  won_at: now,  stage_id: terminalStage?.id ?? deal.pipeline_id, updated_by: user.id }
        : { status: "lost" as const, lost_at: now, lost_reason: parsed.data.lost_reason, stage_id: terminalStage?.id ?? deal.pipeline_id, updated_by: user.id };

    const { error } = await supabase
      .from("crm_deals")
      .update(updatePayload)
      .eq("id", parsed.data.dealId)
      .eq("organization_id", org.id);

    if (error) {
      console.error("closeDeal error:", error);
      return { error: "Failed to close deal" };
    }

    const eventName = parsed.data.outcome === "won" ? "deal.won" : "deal.lost";

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        eventName,
        aggregateType:  "deal",
        aggregateId:    deal.id,
        payload:
          parsed.data.outcome === "won"
            ? { title: deal.title, value: deal.value ?? null, currency: deal.currency }
            : { title: deal.title, lost_reason: parsed.data.lost_reason ?? null },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "crm_deals",
        entityId:       deal.id,
        action:         "status_change",
        oldData:        { status: "open" },
        newData:        { status: parsed.data.outcome, lost_reason: parsed.data.lost_reason },
        metadata:       { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("closeDeal unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.crm);
  return {};
}
