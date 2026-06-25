import { createClient } from "@/lib/supabase/server";
import type { AiSummary } from "../types/ai.types";
import type { AiEntityType } from "../constants/ai.constants";

export async function getSummary(
  organizationId: string,
  entityType: AiEntityType,
  entityId: string,
): Promise<AiSummary | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_summaries")
    .select(
      "id, organization_id, entity_type, entity_id, summary, model, " +
      "prompt_tokens, completion_tokens, version, generated_at, expires_at, metadata",
    )
    .eq("organization_id", organizationId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (error) {
    console.error("getSummary error:", error);
    return null;
  }
  return data as unknown as AiSummary | null;
}
