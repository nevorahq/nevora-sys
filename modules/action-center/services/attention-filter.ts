import type { ActionItemStatus } from "../types/action-item.types";

/**
 * The single filter contract shared by the Action Center summary cards and the
 * read-only Attention list. Defining the six buckets once — as predicates over
 * `action_items` — is what guarantees a card's count and its filtered list use
 * the *same* conditions, closing the old summary/feed mismatch (the summary read
 * due/overdue counts from an obligations RPC while the feed queried action_items).
 *
 * Date windows operate on `action_items.due_at`, which the generator stores as the
 * UTC midnight of the obligation's due date. Comparing against UTC day boundaries
 * therefore matches how the value was written — this is not a second copy of the
 * obligations-RPC timezone rules, it is the action_items view of the same day.
 */

export const ATTENTION_FILTER_KEYS = [
  "needs_attention",
  "due_today",
  "upcoming",
  "overdue",
  "snoozed",
  "recently_resolved",
] as const;

export type AttentionFilterKey = (typeof ATTENTION_FILTER_KEYS)[number];

export const DEFAULT_ATTENTION_FILTER: AttentionFilterKey = "needs_attention";

/** Statuses that count as "active, needs a look now". Snoozed is deferred, not active. */
export const ACTIVE_ATTENTION_STATUSES: ActionItemStatus[] = ["open", "in_progress", "failed"];

/** The resolved-list window (mirrors recently-resolved.ts). */
export const RESOLVED_WINDOW_DAYS = 7;
/** Upcoming window: due within the next 7 days (matches the notification counters). */
export const UPCOMING_WINDOW_DAYS = 7;

export function isAttentionFilterKey(value: unknown): value is AttentionFilterKey {
  return typeof value === "string" && (ATTENTION_FILTER_KEYS as readonly string[]).includes(value);
}

/** Normalize an untrusted search-param into a valid key, defaulting safely. */
export function parseAttentionFilter(value: unknown): AttentionFilterKey {
  return isAttentionFilterKey(value) ? value : DEFAULT_ATTENTION_FILTER;
}

/**
 * A normalized, backend-agnostic description of one bucket's query conditions.
 * Both the count query and the list query build from this exact object, so they
 * can never drift apart.
 */
export interface AttentionPredicate {
  /** action_items.status IN (...). */
  statuses: ActionItemStatus[];
  /** Inclusive lower bound on due_at (ISO), when set. */
  dueFrom?: string;
  /** Exclusive upper bound on due_at (ISO), when set. */
  dueBefore?: string;
  /** due_at must be non-null (any active-with-deadline bucket). */
  dueRequired?: boolean;
  /** updated_at >= this ISO (resolved window). */
  updatedFrom?: string;
}

function startOfUtcDay(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Build the query conditions for a filter key. Pure — `now` is injected for
 * deterministic tests. The returned predicate is applied identically by the count
 * and the row query in get-attention-view.
 */
export function attentionPredicate(key: AttentionFilterKey, now: Date = new Date()): AttentionPredicate {
  const todayStart = startOfUtcDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const upcomingEnd = addDays(todayStart, UPCOMING_WINDOW_DAYS + 1);

  switch (key) {
    case "needs_attention":
      return { statuses: ACTIVE_ATTENTION_STATUSES };
    case "overdue":
      return { statuses: ACTIVE_ATTENTION_STATUSES, dueRequired: true, dueBefore: todayStart.toISOString() };
    case "due_today":
      return {
        statuses: ACTIVE_ATTENTION_STATUSES,
        dueRequired: true,
        dueFrom: todayStart.toISOString(),
        dueBefore: tomorrowStart.toISOString(),
      };
    case "upcoming":
      return {
        statuses: ACTIVE_ATTENTION_STATUSES,
        dueRequired: true,
        dueFrom: tomorrowStart.toISOString(),
        dueBefore: upcomingEnd.toISOString(),
      };
    case "snoozed":
      return { statuses: ["snoozed"] };
    case "recently_resolved":
      // Rolling 7-day window, matching the existing summary/feed (now - 7d), not a
      // calendar-day boundary — so this bucket stays identical to recently-resolved.ts.
      return {
        statuses: ["resolved", "dismissed"],
        updatedFrom: new Date(now.getTime() - RESOLVED_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      };
  }
}
