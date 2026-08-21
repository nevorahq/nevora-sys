import {
  DEFAULT_REMINDER_OFFSET_DAYS,
  MAX_REMINDER_OFFSET_DAYS,
} from "./task-constants";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeReminderOffset(offset: number | null | undefined): number {
  if (offset == null || !Number.isFinite(offset)) return DEFAULT_REMINDER_OFFSET_DAYS;
  const rounded = Math.trunc(offset);
  if (rounded < 0) return 0;
  if (rounded > MAX_REMINDER_OFFSET_DAYS) return MAX_REMINDER_OFFSET_DAYS;
  return rounded;
}

export function calculateActionDueDate(
  financialDueDate: string | null | undefined,
  offsetDays: number | null | undefined = DEFAULT_REMINDER_OFFSET_DAYS,
): string | null {
  if (!financialDueDate || !ISO_DATE_RE.test(financialDueDate)) return null;
  const base = new Date(`${financialDueDate}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return null;
  base.setUTCDate(base.getUTCDate() - normalizeReminderOffset(offsetDays));
  return base.toISOString().slice(0, 10);
}
