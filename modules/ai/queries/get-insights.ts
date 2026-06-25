import { createClient } from "@/lib/supabase/server";
import type { AiInsight } from "../types/ai.types";
import type { AiInsightModule } from "../constants/ai.constants";

export interface GetInsightsOptions {
  module?: AiInsightModule;
  unreadOnly?: boolean;
  limit?: number;
}

export async function getInsights(
  organizationId: string,
  options: GetInsightsOptions = {},
): Promise<AiInsight[]> {
  const { module, unreadOnly = false, limit = 20 } = options;
  const supabase = await createClient();

  let query = supabase
    .from("ai_insights")
    .select(
      "id, organization_id, insight_type, module, title, body, severity, " +
      "data_snapshot, model, is_read, generated_at, expires_at, metadata",
    )
    .eq("organization_id", organizationId)
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (module) query = query.eq("module", module);
  if (unreadOnly) query = query.eq("is_read", false);

  const { data, error } = await query;
  if (error) {
    console.error("getInsights error:", error);
    return [];
  }
  return (data ?? []) as unknown as AiInsight[];
}
