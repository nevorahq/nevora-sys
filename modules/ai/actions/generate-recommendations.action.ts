"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, accessErrorToActionResult } from "@/lib/security";
import { emitDomainEvent } from "@/lib/events";
import { getAnthropicClient, AI_MODELS, buildRecommendationsPrompt } from "@/lib/ai";
import { featureGateService, usageService } from "@/modules/billing";
import { getDashboardMetrics } from "@/modules/analytics";
import { rawRecommendationSchema } from "../schemas/ai.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import type { RawRecommendation } from "../types/ai.types";

export async function generateRecommendationsAction(
  _prevState: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "data.write", capability: "ai_calls", intent: "execute" });
  } catch (err) {
    const denied = accessErrorToActionResult(err);
    if (denied) return denied;
    throw err;
  }
  const { user, org, workspace } = ctx;

  const blocked = await featureGateService.getBlockedReason(workspace.id, "ai.suggestions.generate");
  if (blocked) {
    return { error: blocked.message };
  }

  try {
    await usageService.assertWithinLimit(workspace.id, "ai_suggestions_monthly", 1);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "AI suggestion limit reached. Upgrade your plan." };
  }

  try {
    const metrics = await getDashboardMetrics(org.id, 30);
    const prompt  = buildRecommendationsPrompt(metrics);
    const supabase = await createClient();

    const { data: request, error: requestError } = await supabase
      .from("ai_requests")
      .insert({ organization_id: org.id, user_id: user.id, action_type: "recommendations" })
      .select("id")
      .single();
    if (requestError || !request) {
      return { error: "AI request limit reached. Upgrade your plan to continue." };
    }

    const anthropic = getAnthropicClient();
    const message = await anthropic.messages.create({
      model:      AI_MODELS.fast,
      max_tokens: 1024,
      messages:   [{ role: "user", content: prompt }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { error: "No response from AI" };
    }

    let rawRecs: RawRecommendation[];
    try {
      const cleaned = textBlock.text.replace(/```json\n?|```\n?/g, "").trim();
      rawRecs = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse recommendations JSON:", textBlock.text);
      return { error: "Failed to parse AI response" };
    }

    const validRecs = rawRecs
      .map((item) => rawRecommendationSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => (r as { success: true; data: RawRecommendation }).data);

    if (validRecs.length === 0) {
      return { error: "AI returned no valid recommendations" };
    }

    await supabase
      .from("ai_recommendations")
      .delete()
      .eq("organization_id", org.id)
      .eq("status", "pending");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error: insertError } = await supabase
      .from("ai_recommendations")
      .insert(
        validRecs.map((rec) => ({
          organization_id: org.id,
          status:          "pending",
          title:           rec.title,
          description:     rec.description,
          action_type:     rec.action_type,
          priority:        rec.priority,
          model:           AI_MODELS.fast,
          expires_at:      expiresAt.toISOString(),
          metadata: {
            prompt_tokens:     message.usage.input_tokens,
            completion_tokens: message.usage.output_tokens,
          },
        })),
      );

    if (insertError) {
      await supabase.from("ai_requests").update({ status: "failed" }).eq("id", request.id);
      console.error("generateRecommendations insert error:", insertError);
      return { error: "Failed to save recommendations" };
    }

    await supabase
      .from("ai_requests")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", request.id);

    await emitDomainEvent({
      organizationId: org.id,
      workspaceId:    workspace.id,
      eventName:      "recommendations.generated",
      aggregateType:  "ai_recommendation",
      aggregateId:    org.id,
      payload:        { count: validRecs.length },
    });
  } catch (err) {
    console.error("generateRecommendations unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.ai);
  return {};
}
