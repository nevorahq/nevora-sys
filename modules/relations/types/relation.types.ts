/**
 * modules/relations — типы продуктового слоя.
 *
 * Сырой примитив живёт в lib/entity-links (EntityLink). Здесь — типы,
 * с которыми работает UI: гидрированная связанная сущность, группировка,
 * кандидаты для поиска.
 */
import type {
  EntityLinkSource,
  EntityLinkStatus,
  EntityLinkType,
  EntityLinkMetadata,
  RelationDirection,
} from "@/lib/entity-links";
import type { EntityKind } from "../constants/relation.constants";

export type { EntityKind } from "../constants/relation.constants";

/** Ссылка на сущность (полиморфная). */
export interface EntityRef {
  type: EntityKind;
  id: string;
}

/**
 * Связанная сущность с точки зрения просматриваемого объекта.
 * `direction` — куда смотрит связь относительно текущей сущности.
 */
export interface RelatedEntity {
  relationId: string;
  relationType: EntityLinkType;
  relationStatus: EntityLinkStatus;
  relationSource: EntityLinkSource;
  relationDirection: RelationDirection;
  confidenceScore: number | null;
  perspective: "outgoing" | "incoming";
  metadata: EntityLinkMetadata;
  createdAt: string;
  entity: RelatedEntityCard;
}

/** Денормализованные поля связанной сущности для карточки в UI. */
export interface RelatedEntityCard {
  type: EntityKind;
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
  href: string;
}

/** Связи, сгруппированные по типу сущности. */
export interface GroupedRelations {
  tasks: RelatedEntity[];
  documents: RelatedEntity[];
  transactions: RelatedEntity[];
  subscriptions: RelatedEntity[];
  total: number;
}

/** Счётчики для компактного виджета. */
export interface RelationCounts {
  tasks: number;
  documents: number;
  transactions: number;
  subscriptions: number;
  total: number;
}

/** Кандидат на связывание (результат поиска). */
export interface RelationCandidate {
  type: EntityKind;
  id: string;
  title: string;
  subtitle: string | null;
}

export type RelationActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };
