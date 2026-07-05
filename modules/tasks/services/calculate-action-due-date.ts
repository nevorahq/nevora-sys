import { DEFAULT_REMINDER_OFFSET_DAYS, MAX_REMINDER_OFFSET_DAYS } from "../constants/task.constants";

/**
 * Financial Context Tasks scheduling math (spec §5, §10). Pure + timezone-safe
 * (operates on YYYY-MM-DD strings via UTC), so it is trivially unit-testable and
 * shared by services, actions and tests as the single source of truth.
 *
 *   task.due_date (action deadline) = financial_due_date - reminder_offset_days
 *
 * The task surfaces `reminder_offset_days` BEFORE the real payment date, never on
 * the day money leaves the account.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Clamp an offset to the supported [0, 365] range, defaulting invalid input. */
export function normalizeReminderOffset(offset: number | null | undefined): number {
  if (offset == null || !Number.isFinite(offset)) return DEFAULT_REMINDER_OFFSET_DAYS;
  const rounded = Math.trunc(offset);
  if (rounded < 0) return 0;
  if (rounded > MAX_REMINDER_OFFSET_DAYS) return MAX_REMINDER_OFFSET_DAYS;
  return rounded;
}

/**
 * The action deadline for a financial task: `financialDueDate` minus
 * `offsetDays` (default 3). Returns a YYYY-MM-DD string, or null when the input
 * date is not a valid ISO date.
 */
export function calculateActionDueDate(
  financialDueDate: string | null | undefined,
  offsetDays: number | null | undefined = DEFAULT_REMINDER_OFFSET_DAYS,
): string | null {
  if (!financialDueDate || !ISO_DATE_RE.test(financialDueDate)) return null;
  const offset = normalizeReminderOffset(offsetDays);

  // Parse as UTC midnight so DST / local offsets can never shift the day.
  const base = new Date(`${financialDueDate}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return null;

  base.setUTCDate(base.getUTCDate() - offset);
  return base.toISOString().slice(0, 10);
}
