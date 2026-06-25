"use server";

import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent } from "@/lib/events";
import { getAnthropicClient, AI_MODELS, buildSummaryPrompt } from "@/lib/ai";
import { checkPlanLimit } from "@/lib/billing";
import { generateSummarySchema } from "../schemas/ai.schemas";
import { SUMMARY_TTL_HOURS } from "../constants/ai.constants";
import type { ActionResult } from "@/lib/validators/common";

export async function generateSummaryAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, org, workspace } = await requireOrg();

  const limitCheck = await checkPlanLimit(org.id, "ai_calls");
  if (!limitCheck.allowed) {
    return { error: limitCheck.reason ?? "AI request limit reached. Upgrade your plan." };
  }

  const rawData = {
    entityType: formData.get("entityType") as string,
    entityId:   formData.get("entityId") as string,
  };

  const parsed = generateSummarySchema.safeParse(rawData);
  if (!parsed.success) return { error: "Invalid entity parameters" };

  try {
    const supabase = await createClient();

    const entityData = await fetchEntityData(
      supabase,
      org.id,
      parsed.data.entityType,
      parsed.data.entityId,
    );

    if (!entityData) return { error: "Entity not found" };

    // Persist the request before contacting the provider. The database trigger
    // is the atomic quota guard, so parallel requests cannot both pass quota.
    const { data: request, error: requestError } = await supabase
      .from("ai_requests")
      .insert({ organization_id: org.id, user_id: user.id, action_type: "summary" })
      .select("id")
      .single();
    if (requestError || !request) {
      return { error: "AI request limit reached. Upgrade your plan to continue." };
    }

    const prompt = buildSummaryPrompt(parsed.data.entityType, entityData);

    const anthropic = getAnthropicClient();
    const message = await anthropic.messages.create({
      model:      AI_MODELS.fast,
      max_tokens: 256,
      messages:   [{ role: "user", content: prompt }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { error: "No response from AI" };
    }

    const summaryText = textBlock.text.trim();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + SUMMARY_TTL_HOURS);

    const { error: upsertError } = await supabase
      .from("ai_summaries")
      .upsert(
        {
          organization_id:   org.id,
          entity_type:       parsed.data.entityType,
          entity_id:         parsed.data.entityId,
          summary:           summaryText,
          model:             AI_MODELS.fast,
          prompt_tokens:     message.usage.input_tokens,
          completion_tokens: message.usage.output_tokens,
          expires_at:        expiresAt.toISOString(),
          metadata:          { source: "manual" },
        },
        { onConflict: "organization_id,entity_type,entity_id", ignoreDuplicates: false },
      );

    if (upsertError) {
      await supabase.from("ai_requests").update({ status: "failed" }).eq("id", request.id);
      console.error("generateSummary upsert error:", upsertError);
      return { error: "Failed to save summary" };
    }

    await supabase
      .from("ai_requests")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", request.id);

    await emitDomainEvent({
      organizationId: org.id,
      workspaceId:    workspace.id,
      eventName:      "summary.generated",
      aggregateType:  "ai_summary",
      aggregateId:    parsed.data.entityId,
      payload: {
        entity_type: parsed.data.entityType,
        entity_id:   parsed.data.entityId,
      },
    });
  } catch (err) {
    console.error("generateSummary unexpected error:", err);
    return { error: "Server error" };
  }

  return {};
}

type SupabaseClient = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

async function fetchEntityData(
  supabase: SupabaseClient,
  orgId: string,
  entityType: string,
  entityId: string,
): Promise<Record<string, unknown> | null> {
  const tableMap: Record<string, string> = {
    task:     "todos",
    deal:     "crm_deals",
    client:   "crm_clients",
    document: "documents",
  };

  const table = tableMap[entityType];
  if (!table) return null;

  const { data } = await supabase
    .from(table)
    .select("*")
    .eq("id", entityId)
    .eq("organization_id", orgId)
    .maybeSingle();

  return data as Record<string, unknown> | null;
}
