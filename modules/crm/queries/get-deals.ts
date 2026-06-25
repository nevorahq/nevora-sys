import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CrmDeal, CrmDealWithStage } from "../types/crm.types";
import type { DealStatus } from "../constants/crm.constants";

export interface GetDealsOptions {
  pipelineId?: string;
  stageId?: string;
  status?: DealStatus;
  clientId?: string;
  assignedTo?: string;
  unassigned?: boolean;
  limit?: number;
  offset?: number;
}

export async function getDeals(
  orgId: string,
  options: GetDealsOptions = {},
): Promise<CrmDeal[]> {
  const supabase = await createClient();

  let query = supabase
    .from("crm_deals")
    .select("id, organization_id, workspace_id, pipeline_id, stage_id, client_id, title, value, currency, status, expected_close_date, assigned_to, created_by, updated_by, won_at, lost_at, lost_reason, created_at, updated_at, deleted_at")
    .eq("organization_id", orgId);

  if (options.pipelineId) query = query.eq("pipeline_id", options.pipelineId);
  if (options.stageId)    query = query.eq("stage_id", options.stageId);
  if (options.status)       query = query.eq("status", options.status);
  if (options.clientId)     query = query.eq("client_id", options.clientId);
  if (options.unassigned) {
    query = query.is("assigned_to", null);
  } else if (options.assignedTo) {
    query = query.eq("assigned_to", options.assignedTo);
  }
  if (options.limit)        query = query.limit(options.limit);
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error("getDeals error:", error);
    return [];
  }

  return (data ?? []) as CrmDeal[];
}

export async function getDealsWithStages(
  orgId: string,
  options: GetDealsOptions = {},
): Promise<CrmDealWithStage[]> {
  const supabase = await createClient();

  let query = supabase
    .from("crm_deals")
    .select(`
      id, organization_id, workspace_id, pipeline_id, stage_id, client_id,
      title, value, currency, status, expected_close_date, assigned_to,
      created_by, updated_by, won_at, lost_at, lost_reason, created_at, updated_at, deleted_at,
      stage:crm_pipeline_stages!stage_id (
        id, pipeline_id, organization_id, name, position, probability, color, stage_type, created_at, updated_at
      ),
      client:crm_clients!client_id (
        id, name, email
      )
    `)
    .eq("organization_id", orgId);

  if (options.pipelineId) query = query.eq("pipeline_id", options.pipelineId);
  if (options.stageId)    query = query.eq("stage_id", options.stageId);
  if (options.status)     query = query.eq("status", options.status);
  if (options.clientId)   query = query.eq("client_id", options.clientId);
  if (options.unassigned) {
    query = query.is("assigned_to", null);
  } else if (options.assignedTo) {
    query = query.eq("assigned_to", options.assignedTo);
  }
  if (options.limit)      query = query.limit(options.limit);
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error("getDealsWithStages error:", error);
    return [];
  }

  return (data ?? []) as unknown as CrmDealWithStage[];
}

export async function getDealById(
  orgId: string,
  dealId: string,
): Promise<CrmDealWithStage | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("crm_deals")
    .select(`
      id, organization_id, workspace_id, pipeline_id, stage_id, client_id,
      title, value, currency, status, expected_close_date, assigned_to,
      created_by, updated_by, won_at, lost_at, lost_reason, created_at, updated_at, deleted_at,
      stage:crm_pipeline_stages!stage_id (
        id, pipeline_id, organization_id, name, position, probability, color, stage_type, created_at, updated_at
      ),
      client:crm_clients!client_id (
        id, name, email
      )
    `)
    .eq("id", dealId)
    .eq("organization_id", orgId)
    .single();

  if (error || !data) return null;

  return data as unknown as CrmDealWithStage;
}
