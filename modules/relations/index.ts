/**
 * modules/relations — Cross-Module Relations (Phase 2).
 *
 * Продуктовый слой поверх примитива lib/entity-links: превращает 4 CRUD-модуля
 * (Tasks, Documents, Money, Subscriptions) в единый business graph.
 *
 * Публичный API модуля. Внутренние queries/services не экспортируются наружу —
 * потребители используют компоненты и actions.
 */

// Components
export { UniversalRelationViewer } from "./components/universal-relation-viewer";
export { LinkedEntitiesWidget } from "./components/linked-entities-widget";
export { RelationSearchDialog } from "./components/relation-search-dialog";
export { RelationTypeSelect } from "./components/relation-type-select";
export { RelationEmptyState } from "./components/relation-empty-state";

// Server Actions
export { createEntityRelation } from "./actions/create-relation.action";
export { deleteEntityRelation } from "./actions/delete-relation.action";
export { searchRelationCandidates } from "./actions/search-relation-candidates.action";

// Services (server-only orchestration)
export {
  getRelationsForEntity,
  createRelation,
  deleteRelation,
} from "./services/relation.service";

// Constants & types
export {
  RELATION_ENTITY_KINDS,
  RELATION_ENTITY_CONFIG,
  ENTITY_KIND_LABELS,
  ENTITY_KIND_SINGULAR,
  RELATION_TYPE_LABELS,
  MANUAL_RELATION_TYPES,
  isEntityKind,
} from "./constants/relation.constants";
export type { EntityKind, RelationEntityMeta } from "./constants/relation.constants";
export type {
  EntityRef,
  RelatedEntity,
  RelatedEntityCard,
  GroupedRelations,
  RelationCounts,
  RelationCandidate,
  RelationActionResult,
} from "./types/relation.types";
