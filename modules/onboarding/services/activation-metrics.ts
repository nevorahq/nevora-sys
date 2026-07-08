import { FIRST_ACTIONS, type FirstAction } from "../types/onboarding.types";

/**
 * Phase B / B7 — the activation funnel, computed from what the product already
 * records. Pure: no I/O, no clock, no Supabase. The query layer fetches rows; this
 * turns them into numbers, which is the part worth testing.
 *
 * Every ratio is `number | null`. A rate with a zero denominator is *undefined*,
 * not zero — reporting "0% confirmation" for a cohort that has never seen a draft
 * would be a lie, and the kind that gets acted on.
 */

/** One row of `onboarding_progress`, plus this user's Action Center last-seen. */
export interface FunnelRow {
  started_at: string;
  selected_at: string | null;
  selected_first_action: FirstAction | null;
  first_action_completed_at: string | null;
  first_workflow_completed_at: string | null;
  dismissed_at: string | null;
  /** `action_center_seen.last_seen_at` for this (org, user); null if never opened. */
  action_center_last_seen_at: string | null;
}

/** Terminal states of the drafts created in the window. */
export interface DraftDecisions {
  accepted: number;
  rejected: number;
  expired: number;
  pending: number;
}

/** `onboarding.first_action_selected` events, split by the surface that fired them. */
export interface SelectionSources {
  wizard: number;
  empty_state: number;
}

export interface ActivationFunnel {
  /** Users who reached the dashboard at all (one onboarding_progress row each). */
  started: number;
  selected: number;
  firstActionCompleted: number;
  activated: number;
  dismissed: number;

  rates: {
    /** Of the users who picked an action, how many produced the entity. */
    firstActionCompletion: number | null;
    /** Of everyone who arrived, how many confirmed their first draft. */
    activation: number | null;
    /** Of the drafts that were decided, how many were confirmed. */
    draftConfirmation: number | null;
    /** …and how many were rejected. The two sum to 1 by construction. */
    draftRejection: number | null;
    /** Of all first-action clicks, how many came from an empty-state CTA. */
    emptyStateCtaShare: number | null;
    /** Of activated users, how many came back on a later day. */
    returnedOnALaterDay: number | null;
  };

  /**
   * Seconds from the first dashboard visit to the first confirmed draft. Median
   * and p90, never a mean: activation times are long-tailed, and one user who
   * left the tab open overnight would swamp the average.
   */
  timeToActivationSeconds: { p50: number | null; p90: number | null };

  /** Which first action people pick, and which of them actually activates. */
  byFirstAction: Record<FirstAction, { selected: number; activated: number }>;
}

export function computeActivationFunnel(
  rows: FunnelRow[],
  drafts: DraftDecisions,
  sources: SelectionSources,
): ActivationFunnel {
  const started = rows.length;
  const selected = rows.filter((r) => r.selected_at !== null).length;
  const firstActionCompleted = rows.filter((r) => r.first_action_completed_at !== null).length;
  const activatedRows = rows.filter((r) => r.first_workflow_completed_at !== null);
  const dismissed = rows.filter((r) => r.dismissed_at !== null).length;

  const decidedDrafts = drafts.accepted + drafts.rejected;
  const totalSelections = sources.wizard + sources.empty_state;

  const durations = activatedRows
    .map((r) => secondsBetween(r.started_at, r.first_workflow_completed_at!))
    .sort((a, b) => a - b);

  return {
    started,
    selected,
    firstActionCompleted,
    activated: activatedRows.length,
    dismissed,

    rates: {
      firstActionCompletion: rate(firstActionCompleted, selected),
      activation: rate(activatedRows.length, started),
      draftConfirmation: rate(drafts.accepted, decidedDrafts),
      draftRejection: rate(drafts.rejected, decidedDrafts),
      emptyStateCtaShare: rate(sources.empty_state, totalSelections),
      returnedOnALaterDay: rate(activatedRows.filter(returnedLater).length, activatedRows.length),
    },

    timeToActivationSeconds: { p50: percentile(durations, 0.5), p90: percentile(durations, 0.9) },
    byFirstAction: countByFirstAction(rows),
  };
}

/** Undefined, not zero, when nothing could have happened yet. */
function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function secondsBetween(from: string, to: string): number {
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
}

/**
 * "Reached the Action Center after onboarding" is degenerate here: activation is
 * *detected* during an Action Center render (reconcileFirstAction runs in
 * getWizardState), and the same render stamps `last_seen_at`. Any "did they visit
 * after activating?" check would read ~100% and mean nothing.
 *
 * A strictly later UTC day is the honest question: did they come back at all?
 */
function returnedLater(row: FunnelRow): boolean {
  if (!row.action_center_last_seen_at || !row.first_workflow_completed_at) return false;
  return utcDay(row.action_center_last_seen_at) > utcDay(row.first_workflow_completed_at);
}

function utcDay(iso: string): string {
  return iso.slice(0, 10);
}

/** Nearest-rank percentile on an ascending array. Empty input has no percentile. */
function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

function countByFirstAction(rows: FunnelRow[]): ActivationFunnel["byFirstAction"] {
  const empty = Object.fromEntries(
    FIRST_ACTIONS.map((action) => [action, { selected: 0, activated: 0 }]),
  ) as ActivationFunnel["byFirstAction"];

  for (const row of rows) {
    const action = row.selected_first_action;
    if (!action) continue;
    empty[action].selected += 1;
    if (row.first_workflow_completed_at) empty[action].activated += 1;
  }
  return empty;
}
