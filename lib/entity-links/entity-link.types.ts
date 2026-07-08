/**
 * Entity Links — типы.
 *
 * Универсальная связь между сущностями разных модулей.
 * Полиморфно по `type` + `id` (см. миграции 040 + 047).
 *
 * Соответствует колонкам public.entity_links.
 */

// Управляемый словарь смысла связи (зеркалит CHECK в БД, миграция 047).
// Наследие 040 + business-vocabulary Phase 2.
export const ENTITY_LINK_TYPES = [
  // legacy (040)
  "related",
  "generated_from",
  "attached_to",
  "paid_by",
  "renewed_by",
  "requires_action",
  "belongs_to",
  // Phase 2
    "related_to",
    "documented_by",
    "requires_action_task",
    "belongs_to_subscription",
    "invoice_for_transaction",
    "contract_for_subscription",
    "renewal_task",
    // Phase C
    "evidence_for",
    "created_from",
    "suggested_for",
    "confirmed_as",
  ] as const;

export type EntityLinkType = (typeof ENTITY_LINK_TYPES)[number];

export const RELATION_DIRECTIONS = ["bidirectional", "direct", "derived"] as const;
export type RelationDirection = (typeof RELATION_DIRECTIONS)[number];

/** Legacy metadata source. New rows also store normalized `source` column. */
export type RelationSource = "manual" | "auto" | "user" | "system" | "ai";
export type EntityLinkStatus = "suggested" | "waiting_confirmation" | "confirmed" | "rejected" | "unlinked";
export type EntityLinkSource = "user" | "system" | "ai";

/**
 * Metadata-конверт связи. Готовит почву под Automation/AI:
 *   source     — кто создал связь
 *   confidence — уверенность авто-связывания (0..1)
 *   matched_by — по каким сигналам сматчили (merchant, amount, period…)
 */
export interface EntityLinkMetadata {
  source?: RelationSource;
  confidence?: number;
  matched_by?: string[];
  [key: string]: unknown;
}

/** Запись entity_link из БД. */
export interface EntityLink {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  link_type: EntityLinkType;
  status: EntityLinkStatus;
  source: EntityLinkSource;
  confidence_score: number | null;
  relation_direction: RelationDirection;
  metadata: EntityLinkMetadata;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Колонки, которые мы безопасно читаем (без select("*")). */
export const ENTITY_LINK_COLUMNS =
  "id, organization_id, workspace_id, source_type, source_id, target_type, target_id, link_type, status, source, confidence_score, relation_direction, metadata, created_by, created_at, updated_at" as const;

export interface CreateEntityLinkInput {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  linkType?: EntityLinkType;
  relationDirection?: RelationDirection;
  metadata?: EntityLinkMetadata;
  status?: EntityLinkStatus;
  source?: EntityLinkSource;
  confidenceScore?: number | null;
}

export interface GetEntityLinksInput {
  /** Найти связи, где сущность выступает source. */
  source?: { type: string; id: string };
  /** Найти связи, где сущность выступает target. */
  target?: { type: string; id: string };
  /** Опциональный фильтр по типу связи. */
  linkType?: EntityLinkType;
}

export interface DeleteEntityLinkInput {
  id: string;
}

/** Унифицированный результат сервисов entity-links. */
export type EntityLinkResult<T = EntityLink> =
  | { ok: true; data: T }
  | { ok: false; error: string };
