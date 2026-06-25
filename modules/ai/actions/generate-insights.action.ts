"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent } from "@/lib/events";
import { getAnthropicClient, AI_MODELS, buildInsightsPrompt } from "@/lib/ai";
import { checkPlanLimit } from "@/lib/billing";
import { getDashboardMetrics } from "@/modules/analytics";
import { generateInsightsSchema, rawInsightSchema } from "../schemas/ai.schemas";
import { INSIGHTS_TTL_HOURS } from "../constants/ai.constants";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import type { RawInsight } from "../types/ai.types";

export async function generateInsightsAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, org, workspace } = await requireOrg();

  const limitCheck = await checkPlanLimit(org.id, "ai_calls");
  if (!limitCheck.allowed) {
    return { error: limitCheck.reason ?? "AI request limit reached. Upgrade your plan." };
  }

  const rawData = {
    periodDays: formData.get("periodDays") ? Number(formData.get("periodDays")) : 30,
  };

  const parsed = generateInsightsSchema.safeParse(rawData);
  if (!parsed.success) return { error: "Invalid parameters" };

  try {
    const metrics = await getDashboardMetrics(org.id, parsed.data.periodDays);
    const prompt  = buildInsightsPrompt(metrics, parsed.data.periodDays);
    const supabase = await createClient();

    const { data: request, error: requestError } = await supabase
      .from("ai_requests")
      .insert({ organization_id: org.id, user_id: user.id, action_type: "insights" })
      .select("id")
      .single();
    if (requestError || !request) {
      return { error: "AI request limit reached. Upgrade your plan to continue." };
    }

    const anthropic = getAnthropicClient();
    const message = await anthropic.messages.create({
      model:      AI_MODELS.default,
      max_tokens: 1024,
      messages:   [{ role: "user", content: prompt }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { error: "No response from AI" };
    }

    let rawInsights: RawInsight[];
    try {
      const cleaned = textBlock.text.replace(/```json\n?|```\n?/g, "").trim();
      rawInsights = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse insights JSON:", textBlock.text);
      return { error: "Failed to parse AI response" };
    }

    const validInsights = rawInsights
      .map((item) => rawInsightSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => (r as { success: true; data: RawInsight }).data);

    if (validInsights.length === 0) {
      return { error: "AI returned no valid insights" };
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + INSIGHTS_TTL_HOURS);

    const { error: insertError } = await supabase
      .from("ai_insights")
      .insert(
        validInsights.map((insight) => ({
          organization_id: org.id,
          insight_type:    insight.insight_type,
          module:          insight.module,
          title:           insight.title,
          body:            insight.body,
          severity:        insight.severity,
          data_snapshot:   metrics as unknown as Record<string, unknown>,
          model:           AI_MODELS.default,
          expires_at:      expiresAt.toISOString(),
          metadata: {
            period_days:       parsed.data.periodDays,
            prompt_tokens:     message.usage.input_tokens,
            completion_tokens: message.usage.output_tokens,
          },
        })),
      );

    if (insertError) {
      await supabase.from("ai_requests").update({ status: "failed" }).eq("id", request.id);
      console.error("generateInsights insert error:", insertError);
      return { error: "Failed to save insights" };
    }

    await supabase
      .from("ai_requests")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", request.id);

    await emitDomainEvent({
      organizationId: org.id,
      workspaceId:    workspace.id,
      eventName:      "insights.generated",
      aggregateType:  "ai_insight",
      aggregateId:    org.id,
      payload: {
        count:       validInsights.length,
        period_days: parsed.data.periodDays,
      },
    });
  } catch (err) {
    console.error("generateInsights unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.ai);
  return {};
}
