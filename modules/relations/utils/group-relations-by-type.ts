import type { GroupedRelations, RelatedEntity, RelationCounts } from "../types/relation.types";

/**
 * Группирует плоский список связанных сущностей по виду:
 * tasks / documents / transactions / subscriptions.
 *
 * Чистая функция — основа и для viewer, и для widget (counts).
 */
export function groupRelationsByType(items: RelatedEntity[]): GroupedRelations {
  const grouped: GroupedRelations = {
    tasks: [],
    documents: [],
    transactions: [],
    subscriptions: [],
    total: items.length,
  };

  for (const item of items) {
    switch (item.entity.type) {
      case "task":
        grouped.tasks.push(item);
        break;
      case "document":
        grouped.documents.push(item);
        break;
      case "transaction":
        grouped.transactions.push(item);
        break;
      case "subscription":
        grouped.subscriptions.push(item);
        break;
    }
  }

  return grouped;
}

/** Счётчики из сгруппированных связей (для LinkedEntitiesWidget). */
export function toRelationCounts(grouped: GroupedRelations): RelationCounts {
  return {
    tasks: grouped.tasks.length,
    documents: grouped.documents.length,
    transactions: grouped.transactions.length,
    subscriptions: grouped.subscriptions.length,
    total: grouped.total,
  };
}
