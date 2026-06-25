import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CrmPipelineWithStages } from "../types/crm.types";

export async function getPipelinesWithStages(orgId: string): Promise<CrmPipelineWithStages[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("crm_pipelines")
    .select(`
      id, organization_id, name, is_default, created_by, created_at, updated_at,
      crm_pipeline_stages (
        id, pipeline_id, organization_id, name, position,
        probability, color, stage_type, created_at, updated_at
      )
    `)
    .eq("organization_id", orgId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getPipelinesWithStages error:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    ...row,
    crm_pipeline_stages: undefined,
    stages: [...(Array.isArray(row.crm_pipeline_stages) ? row.crm_pipeline_stages : [])]
      .sort((a, b) => a.position - b.position),
  })) as CrmPipelineWithStages[];
}

export async function getDefaultPipeline(orgId: string): Promise<CrmPipelineWithStages | null> {
  const pipelines = await getPipelinesWithStages(orgId);
  return pipelines.find((p) => p.is_default) ?? pipelines[0] ?? null;
}
