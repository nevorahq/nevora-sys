import type {
  AiEntityType, AiInsightType, AiInsightModule,
  AiSeverity, AiActionType, AiPriority, AiRecStatus,
} from "../constants/ai.constants";

export interface AiSummary {
  id: string;
  organization_id: string;
  entity_type: AiEntityType;
  entity_id: string;
  summary: string;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  version: number;
  generated_at: string;
  expires_at: string | null;
  metadata: Record<string, unknown>;
}

export interface AiInsight {
  id: string;
  organization_id: string;
  insight_type: AiInsightType;
  module: AiInsightModule;
  title: string;
  body: string;
  severity: AiSeverity;
  data_snapshot: Record<string, unknown>;
  model: string;
  is_read: boolean;
  generated_at: string;
  expires_at: string | null;
  metadata: Record<string, unknown>;
}

export interface AiRecommendation {
  id: string;
  organization_id: string;
  title: string;
  description: string;
  action_type: AiActionType;
  priority: AiPriority;
  entity_type: AiEntityType | null;
  entity_id: string | null;
  status: AiRecStatus;
  model: string;
  due_date: string | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
  generated_at: string;
  expires_at: string | null;
  metadata: Record<string, unknown>;
}

// Ответ от Claude при генерации инсайтов (парсится из JSON)
export interface RawInsight {
  insight_type: AiInsightType;
  module: AiInsightModule;
  title: string;
  body: string;
  severity: AiSeverity;
}

// Ответ от Claude при генерации рекомендаций
export interface RawRecommendation {
  title: string;
  description: string;
  action_type: AiActionType;
  priority: AiPriority;
}
