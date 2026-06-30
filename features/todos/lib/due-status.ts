import type { TaskStatus } from "@/modules/tasks/constants/task.constants";

/**
 * "Heightened attention" classification for a task's due date.
 *
 *   overdue    — due date is in the past
 *   due_today  — due date is today
 *   due_soon   — due within DUE_SOON_DAYS (1..3) days
 *   none       — no due date, far away, or the task is already done
 *
 * Pure + UTC-based (matching the date string stored in `due_date` and the
 * existing task-summary aggregation), so it is deterministic and unit-testable.
 */

export type DueLevel = "overdue" | "due_today" | "due_soon" | "none";

export interface DueStatus {
  level: DueLevel;
  /** Signed day delta (due − today). Negative = overdue, 0 = today, >0 = ahead. */
  days: number;
}

/** Upper bound (inclusive) for the "due soon" window, in days. */
export const DUE_SOON_DAYS = 3;

const MS_PER_DAY = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

export function getDueStatus(
  dueDate: string | null | undefined,
  status: TaskStatus,
  now: Date = new Date(),
): DueStatus {
  if (!dueDate || status === "done") return { level: "none", days: 0 };

  const match = dueDate.match(DATE_RE);
  if (!match) return { level: "none", days: 0 };

  const due = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((due - today) / MS_PER_DAY);

  if (days < 0) return { level: "overdue", days };
  if (days === 0) return { level: "due_today", days };
  if (days <= DUE_SOON_DAYS) return { level: "due_soon", days };
  return { level: "none", days };
}
