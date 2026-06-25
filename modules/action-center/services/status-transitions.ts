import type { ActionItemStatus } from "../types/action-item.types";

/**
 * Whitelist допустимых переходов статуса action item (Phase 3 §11).
 *
 * Чистый модуль — единственный источник истины и для мутаций, и для тестов.
 * Восстановление (resolved/dismissed → open) НЕ входит в обычные переходы —
 * это отдельный restore-флаг, чтобы случайный resolve→open был невозможен.
 */
const ALLOWED: Record<ActionItemStatus, ActionItemStatus[]> = {
  open: ["in_progress", "snoozed", "resolved", "dismissed"],
  snoozed: ["open", "resolved", "dismissed"],
  in_progress: ["resolved", "failed", "dismissed"],
  failed: ["open", "dismissed"],
  resolved: [], // только через restore
  dismissed: [], // только через restore
  cancelled: [], // только через system regeneration
};

/** Статусы, из которых разрешён явный restore → open. */
const RESTORABLE: ActionItemStatus[] = ["resolved", "dismissed"];

export function canTransition(
  from: ActionItemStatus,
  to: ActionItemStatus,
  opts: { restore?: boolean } = {},
): boolean {
  if (opts.restore) {
    return to === "open" && RESTORABLE.includes(from);
  }
  return ALLOWED[from]?.includes(to) ?? false;
}

/** Бросает при недопустимом переходе — для использования в мутациях. */
export function assertTransition(
  from: ActionItemStatus,
  to: ActionItemStatus,
  opts: { restore?: boolean } = {},
): void {
  if (!canTransition(from, to, opts)) {
    throw new InvalidTransitionError(from, to);
  }
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: ActionItemStatus,
    public readonly to: ActionItemStatus,
  ) {
    super(`Invalid status transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}
