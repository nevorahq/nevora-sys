import type { ActionItem } from "../types/action-item.types";

/**
 * Ordering rules for the Action Center "Recently Resolved" section.
 *
 * Pure module (no server imports) so it is unit-testable and shared as the single
 * source of truth for the queue order.
 */

/** Окно секции «Недавно закрытые» и размеры выборки. */
export const RESOLVED_WINDOW_DAYS = 7;
export const RESOLVED_LIMIT = 10;
// Буфер шире итогового лимита: из БД берём запас по updated_at, затем точно
// пересортировываем/обрезаем по фактическому времени резолва в памяти.
export const RESOLVED_BUFFER = 30;

/**
 * Момент попадания item'а в resolved-лист: resolved_at (resolved) или
 * dismissed_at (dismissed). Fallback на updated_at на случай старых строк без
 * проставленного таймстемпа. Ключ сортировки «последние сверху».
 */
export function resolvedAt(item: ActionItem): string {
  return item.resolved_at ?? item.dismissed_at ?? item.updated_at;
}

/**
 * Очередь секции «Недавно закрытые»: только элементы, реально попавшие в
 * resolved-лист за окно `since`, отсортированные по времени резолва (последние
 * сверху), обрезанные до `limit`.
 */
export function orderRecentlyResolved(
  rows: ActionItem[],
  since: string,
  limit: number = RESOLVED_LIMIT,
): ActionItem[] {
  return rows
    .filter((r) => resolvedAt(r) >= since)
    .sort((a, b) => {
      const resolvedOrder = resolvedAt(b).localeCompare(resolvedAt(a));
      if (resolvedOrder !== 0) return resolvedOrder;

      const updatedOrder = b.updated_at.localeCompare(a.updated_at);
      if (updatedOrder !== 0) return updatedOrder;

      const createdOrder = b.created_at.localeCompare(a.created_at);
      if (createdOrder !== 0) return createdOrder;

      return b.id.localeCompare(a.id);
    })
    .slice(0, limit);
}
