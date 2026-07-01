import type { EntityLinkType } from "@/lib/entity-links";
import { RELATION_TYPE_LABELS, type EntityKind } from "../constants/relation.constants";

/**
 * Perspective-aware label overrides.
 *
 * entity_links хранит source/target без гарантии "кто есть кто" с точки
 * зрения бизнес-смысла (RelationSearchDialog всегда шлёт sourceEntityType =
 * просматриваемую страницу, так что порядок зависит от того, откуда создали
 * связь). Поэтому label выбираем не по perspective (outgoing/incoming), а по
 * тому, какого вида сущность отображается в карточке (otherEntityKind) —
 * это устойчиво к направлению хранения и не требует schema-изменений.
 *
 * Ключи без override используют общий RELATION_TYPE_LABELS (symmetric case:
 * related_to, attached_to, legacy 040 типы).
 */
const RELATION_TYPE_PERSPECTIVE_LABELS: Partial<Record<EntityLinkType, Partial<Record<EntityKind, string>>>> = {
  documented_by: {
    document: "Documented by",
    task: "Documents",
    transaction: "Documents",
    subscription: "Documents",
  },
  paid_by: {
    subscription: "Payment for",
    transaction: "Paid by",
  },
  belongs_to_subscription: {
    subscription: "Belongs to",
    task: "Includes",
    transaction: "Includes",
  },
  invoice_for_transaction: {
    document: "Invoice",
    transaction: "Invoice for",
  },
  contract_for_subscription: {
    document: "Contract",
    subscription: "Contract for",
  },
  renewal_task: {
    task: "Renewal task",
    subscription: "Renewal for",
  },
  requires_action_task: {
    task: "Requires action",
    document: "Needs follow-up",
    transaction: "Needs follow-up",
    subscription: "Needs follow-up",
  },
};

/**
 * Label связи, адаптированный к тому, какая сущность отображается в карточке
 * (otherEntityKind), а не всегда одна и та же строка независимо от стороны.
 */
export function getRelationTypeLabel(relationType: EntityLinkType, otherEntityKind: EntityKind): string {
  const override = RELATION_TYPE_PERSPECTIVE_LABELS[relationType]?.[otherEntityKind];
  return override ?? RELATION_TYPE_LABELS[relationType];
}
