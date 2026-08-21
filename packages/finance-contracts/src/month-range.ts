/**
 * Resolve a `?month=YYYY-MM` URL param into a UTC month window for the Money
 * page history navigator.
 *
 * Pure + side-effect-free so it can be unit-tested without a request. All math
 * is in UTC (matching the DATE column `transaction_date`); the upper bound is
 * exclusive (`< nextMonthStart`) so callers never have to compute "last day".
 *
 * Browsing the future is not allowed: an out-of-range, malformed, or future
 * month clamps to the current month.
 */

const MONTH_RE = /^(\d{4})-(\d{2})$/;

export interface MonthRange {
  /** Canonical key for the selected month, e.g. "2026-06". */
  month: string;
  /** Inclusive lower bound (YYYY-MM-DD, UTC 1st of the month). */
  monthStart: string;
  /** Exclusive upper bound (YYYY-MM-DD, UTC 1st of the next month). */
  nextMonthStart: string;
  /** Human label, e.g. "June 2026". */
  label: string;
  /** True when the selected month is the current (UTC) month. */
  isCurrent: boolean;
  /** Previous month key — always navigable. */
  prevMonth: string;
  /** Next month key, or null when already at the current month (no future). */
  nextMonth: string | null;
}

export function resolveMonthRange(
  param?: string | null,
  now: Date = new Date(),
  locale = "en-US",
): MonthRange {
  const curY = now.getUTCFullYear();
  const curM = now.getUTCMonth(); // 0-based

  let y = curY;
  let m = curM;

  const match = typeof param === "string" ? param.match(MONTH_RE) : null;
  if (match) {
    const py = Number(match[1]);
    const pm = Number(match[2]) - 1;
    const inRange = pm >= 0 && pm <= 11;
    const notFuture = py < curY || (py === curY && pm <= curM);
    if (inRange && notFuture) {
      y = py;
      m = pm;
    }
  }

  const startDate = new Date(Date.UTC(y, m, 1));
  const nextDate = new Date(Date.UTC(y, m + 1, 1));
  const prevDate = new Date(Date.UTC(y, m - 1, 1));
  const isCurrent = y === curY && m === curM;

  return {
    month: monthKey(y, m),
    monthStart: startDate.toISOString().slice(0, 10),
    nextMonthStart: nextDate.toISOString().slice(0, 10),
    label: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(startDate),
    isCurrent,
    prevMonth: monthKey(prevDate.getUTCFullYear(), prevDate.getUTCMonth()),
    nextMonth: isCurrent ? null : monthKey(nextDate.getUTCFullYear(), nextDate.getUTCMonth()),
  };
}

function monthKey(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}
