import type {
  ClientStatus, ClientType, ClientSource,
  DealStatus, StageType, ActivityType, CrmEntityType,
} from "../constants/crm.constants";

// ── Pipeline ──────────────────────────────────────────────────────────────────

export interface CrmPipeline {
  id: string;
  organization_id: string;
  name: string;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmPipelineStage {
  id: string;
  pipeline_id: string;
  organization_id: string;
  name: string;
  position: number;
  probability: number;
  color: string;
  stage_type: StageType;
  created_at: string;
  updated_at: string;
}

export interface CrmPipelineWithStages extends CrmPipeline {
  stages: CrmPipelineStage[];
}

// ── Client ────────────────────────────────────────────────────────────────────

export interface CrmClient {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  company: string | null;
  client_type: ClientType;
  status: ClientStatus;
  source: ClientSource;
  description: string | null;
  assigned_to: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CrmContact {
  id: string;
  organization_id: string;
  client_id: string | null;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  is_primary: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CrmClientWithContacts extends CrmClient {
  contacts: CrmContact[];
}

// ── Deal ──────────────────────────────────────────────────────────────────────

export interface CrmDeal {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  pipeline_id: string;
  stage_id: string;
  client_id: string | null;
  title: string;
  value: number | null;
  currency: string;
  status: DealStatus;
  expected_close_date: string | null;
  assigned_to: string | null;
  created_by: string | null;
  updated_by: string | null;
  won_at: string | null;
  lost_at: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CrmDealWithStage extends CrmDeal {
  stage: CrmPipelineStage;
  client: Pick<CrmClient, "id" | "name" | "email"> | null;
}

// ── Activity & Note ───────────────────────────────────────────────────────────

export interface CrmActivity {
  id: string;
  organization_id: string;
  entity_type: CrmEntityType;
  entity_id: string;
  activity_type: ActivityType;
  title: string;
  description: string | null;
  scheduled_at: string | null;
  completed: boolean;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmNote {
  id: string;
  organization_id: string;
  entity_type: CrmEntityType;
  entity_id: string;
  content: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ── Tag ───────────────────────────────────────────────────────────────────────

export interface CrmTag {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  created_at: string;
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface CrmSummary {
  totalClients: number;
  newLeads: number;
  openDeals: number;
  openDealsValue: number;
  wonDealsThisMonth: number;
  wonValueThisMonth: number;
  activitiesDueToday: number;
}
