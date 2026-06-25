/**
 * Relation domain events (Phase 2).
 *
 * Сами события эмитятся в lib/entity-links (create/delete) — единый источник
 * истины, чтобы и ручные, и авто-связи (automation engine) проходили один путь.
 * Здесь — типобезопасные имена и билдеры payload для потребителей (Automation,
 * Analytics, AI context builder), чтобы не хардкодить строки по модулям.
 */
import type { DomainEventName } from "@/lib/events";

export const RELATION_EVENTS = {
  created: "relation.created",
  deleted: "relation.deleted",
  updated: "relation.updated",
  autoCreated: "relation.auto_created",
  suggested: "relation.suggested",
} as const satisfies Record<string, DomainEventName>;

export interface RelationEventEntityPayload {
  source_entity_type: string;
  source_entity_id: string;
  target_entity_type: string;
  target_entity_id: string;
  relation_type: string;
}

/** Базовый payload связи для domain-event/audit. */
export function buildRelationEventPayload(input: {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: string;
}): RelationEventEntityPayload {
  return {
    source_entity_type: input.sourceType,
    source_entity_id: input.sourceId,
    target_entity_type: input.targetType,
    target_entity_id: input.targetId,
    relation_type: input.relationType,
  };
}
