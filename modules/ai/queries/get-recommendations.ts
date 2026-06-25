import { createClient } from "@/lib/supabase/server";
import type { AiRecommendation } from "../types/ai.types";
import type { AiRecStatus } from "../constants/ai.constants";

export interface GetRecommendationsOptions {
  status?: AiRecStatus;
  limit?: number;
}

export async function getRecommendations(
  organizationId: string,
  options: GetRecommendationsOptions = {},
): Promise<AiRecommendation[]> {
  const { status = "pending", limit = 10 } = options;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_recommendations")
    .select(
      "id, organization_id, title, description, action_type, priority, " +
      "entity_type, entity_id, status, model, due_date, " +
      "dismissed_at, dismissed_by, generated_at, expires_at, metadata",
    )
    .eq("organization_id", organizationId)
    .eq("status", status)
    .order("priority", { ascending: false })
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getRecommendations error:", error);
    return [];
  }
  return (data ?? []) as unknown as AiRecommendation[];
}
