import type { EntityLinkType } from "@/lib/entity-links";
import { isEntityKind, type EntityKind } from "../constants/relation.constants";

/**
 * Какие relation types имеют смысл для пары active-module entity kinds.
 *
 * Audit (2026-07-01): словарь ENTITY_LINK_TYPES зеркалит DB CHECK constraint
 * (миграция 047), поэтому новые значения сюда не добавляются без migration.
 * Вместо этого пары переиспользуют существующий MANUAL_RELATION_TYPES —
 * `related_to` как универсальный fallback, плюс уже реализованные в проде
 * семантические типы (paid_by в on-transaction-created, invoice_for_transaction
 * в document-extraction-service, documented_by в create-subscription-document-
 * with-attachments). Пары без специфичного смысла (task↔task, document↔document,
 * transaction↔transaction, subscription↔subscription) получают только related_to —
 * blocks/depends_on/duplicates и подобные потребовали бы migration и здесь
 * сознательно не добавлены.
 */
function pairKey(a: EntityKind, b: EntityKind): string {
  return [a, b].sort().join("|");
}

const RELATION_TYPE_PAIRS: Record<string, EntityLinkType[]> = {
  [pairKey("task", "document")]: ["related_to", "documented_by", "attached_to"],
  [pairKey("task", "subscription")]: [
    "related_to",
    "renewal_task",
    "requires_action_task",
    "belongs_to_subscription",
  ],
  [pairKey("task", "transaction")]: ["related_to", "requires_action_task"],
  [pairKey("task", "task")]: ["related_to"],
  [pairKey("document", "document")]: ["related_to"],
  [pairKey("document", "subscription")]: [
    "related_to",
    "contract_for_subscription",
    "documented_by",
    "attached_to",
  ],
  [pairKey("document", "transaction")]: [
    "related_to",
    "invoice_for_transaction",
    "documented_by",
    "attached_to",
  ],
  [pairKey("subscription", "transaction")]: ["related_to", "paid_by", "belongs_to_subscription"],
  [pairKey("subscription", "subscription")]: ["related_to"],
  [pairKey("transaction", "transaction")]: ["related_to"],
};

/**
 * Возвращает relation types, доступные для ручного связывания указанной пары.
 *
 * Fail-closed: неизвестный/paused (CRM) entity kind с любой стороны → [].
 * Порядок sourceType/targetType не важен — связь симметрична по смыслу пары.
 */
export function getRelationTypeOptionsForPair(
  sourceType: string,
  targetType: string,
): EntityLinkType[] {
  if (!isEntityKind(sourceType) || !isEntityKind(targetType)) return [];
  return RELATION_TYPE_PAIRS[pairKey(sourceType, targetType)] ?? [];
}
