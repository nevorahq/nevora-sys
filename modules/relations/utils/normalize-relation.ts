import type { EntityLink } from "@/lib/entity-links";
import { isEntityKind } from "../constants/relation.constants";
import type { EntityRef } from "../types/relation.types";

/**
 * «Развёрнутая» связь относительно просматриваемой сущности: какая сущность
 * на другом конце и в какую сторону смотрит связь.
 */
export interface NormalizedRelation {
  relationId: string;
  relationType: EntityLink["link_type"];
  relationStatus: EntityLink["status"];
  relationSource: EntityLink["source"];
  relationDirection: EntityLink["relation_direction"];
  confidenceScore: EntityLink["confidence_score"];
  perspective: "outgoing" | "incoming";
  metadata: EntityLink["metadata"];
  createdAt: string;
  other: EntityRef;
}

/**
 * Нормализует связь с точки зрения сущности (viewedType, viewedId).
 *
 * Возвращает null, если:
 *   - связь не касается просматриваемой сущности (защита от мусора);
 *   - другой конец — не поддерживаемый MVP-тип (client/deal и т.п.).
 *
 * Чистая функция — легко тестируется без БД.
 */
export function normalizeRelation(
  link: EntityLink,
  viewedType: string,
  viewedId: string,
): NormalizedRelation | null {
  const isSource = link.source_type === viewedType && link.source_id === viewedId;
  const isTarget = link.target_type === viewedType && link.target_id === viewedId;

  if (!isSource && !isTarget) return null;

  const otherType = isSource ? link.target_type : link.source_type;
  const otherId = isSource ? link.target_id : link.source_id;

  if (!isEntityKind(otherType)) return null;

  return {
    relationId: link.id,
    relationType: link.link_type,
    relationStatus: link.status,
    relationSource: link.source,
    relationDirection: link.relation_direction,
    confidenceScore: link.confidence_score,
    perspective: isSource ? "outgoing" : "incoming",
    metadata: link.metadata ?? {},
    createdAt: link.created_at,
    other: { type: otherType, id: otherId },
  };
}
