"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent, emitAuditLog } from "@/lib/events";
import { dismissRecommendationSchema } from "../schemas/ai.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function dismissRecommendationAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, org, workspace } = await requireOrg();

  const parsed = dismissRecommendationSchema.safeParse({
    recommendationId: formData.get("recommendationId") as string,
  });
  if (!parsed.success) return { error: "Invalid recommendation ID" };

  try {
    const supabase = await createClient();

    const { data: rec, error } = await supabase
      .from("ai_recommendations")
      .update({
        status:       "dismissed",
        dismissed_at: new Date().toISOString(),
        dismissed_by: user.id,
      })
      .eq("id", parsed.data.recommendationId)
      .eq("organization_id", org.id)
      .eq("status", "pending")
      .select("id")
      .single();

    if (error || !rec) return { error: "Recommendation not found or already handled" };

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        workspaceId:    workspace.id,
        eventName:      "recommendation.dismissed",
        aggregateType:  "ai_recommendation",
        aggregateId:    rec.id,
        payload:        {},
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType:     "ai_recommendations",
        entityId:       rec.id,
        action:         "delete",
        metadata:       { source: "dashboard", action: "dismissed" },
      }),
    ]);
  } catch (err) {
    console.error("dismissRecommendation unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.ai);
  return {};
}
