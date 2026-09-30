/**
 * When a daily digest is due (ADR 003). Pure — `now` is injected.
 *
 * The digest goes out at `digestHour` in the user's notification timezone and
 * may be retried for `DIGEST_WINDOW_HOURS` after it: a missed or failed hourly
 * run catches up the same morning, never in the evening. The window does not
 * wrap past midnight, so a digest always belongs to one local calendar day.
 */

export const DEFAULT_DIGEST_HOUR = 9;
export const DIGEST_WINDOW_HOURS = 3;
export const MAX_DIGEST_ATTEMPTS = 3;

export interface LocalMoment {
  /** YYYY-MM-DD in the given timezone. */
  date: string;
  /** 0–23 in the given timezone. */
  hour: number;
}

/** The calendar date and hour at `now` in `timezone`; null for an unknown timezone. */
export function localMoment(now: Date, timezone: string): LocalMoment | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
    const year = get("year");
    const month = get("month");
    const day = get("day");
    const hour = Number(get("hour"));
    if (!year || !month || !day || !Number.isInteger(hour)) return null;
    return { date: `${year}-${month}-${day}`, hour };
  } catch {
    return null;
  }
}

/** True when `hour` falls in [digestHour, digestHour + window), clipped at the end of the day. */
export function isInDigestWindow(hour: number, digestHour: number, windowHours: number = DIGEST_WINDOW_HOURS): boolean {
  const end = Math.min(24, digestHour + windowHours);
  return hour >= digestHour && hour < end;
}

/** The first valid IANA timezone among the candidates, else UTC. */
export function resolveDigestTimezone(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    if (candidate && localMoment(new Date(0), candidate)) return candidate;
  }
  return "UTC";
}
