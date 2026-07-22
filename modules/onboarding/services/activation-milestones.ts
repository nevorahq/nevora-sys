/**
 * Activation milestones (Sprint 6 — S6.2).
 *
 * The first-action funnel (`activation-metrics.ts`) measures onboarding → first
 * workflow. This layer measures the FULL set of meaningful outcomes across the
 * product, computed from `domain_events` — no new table, no PII. Every number is
 * an aggregate count (distinct organizations reached, or event totals), never a
 * per-user or content value.
 */

/** Milestone → the domain event that proves it happened. */
export const ACTIVATION_MILESTONES = {
  first_capture: "planner_entry.created",
  first_accepted_inbox: "planner_suggestion.accepted",
  first_completed_task: "task.completed",
  first_confirmed_document: "financial_suggestion.confirmed",
  first_paid_subscription_cycle: "financial_obligation.paid",
  action_center_resolution: "action_item.resolved",
} as const;

export type ActivationMilestone = keyof typeof ACTIVATION_MILESTONES;

/** Background failures a user should be told about (failure-visibility, Sprint 3). */
export const FAILURE_EVENTS = [
  "action_item.failed",
  "planner_entry.failed",
  "planner_suggestion.failed",
] as const;

/** The events this layer needs from `domain_events`. */
export const MILESTONE_EVENT_NAMES: string[] = [
  ...Object.values(ACTIVATION_MILESTONES),
  ...FAILURE_EVENTS,
];

/** Minimal event shape — org + name only; timestamps/content are not needed. */
export interface MilestoneEvent {
  organization_id: string;
  event_name: string;
}

export interface ActivationMilestones {
  /** Distinct organizations that reached each milestone at least once. */
  reach: Record<ActivationMilestone, number>;
  /** Total background-failure events (surfaced to users per Sprint 3). */
  failureEvents: number;
  /** Total Action Center resolutions — the recovery/closure signal. */
  resolutionEvents: number;
}

/**
 * Fold raw domain events into aggregate milestone reach. Pure and deterministic:
 * distinct-org reach per milestone plus failure/resolution totals.
 */
export function computeActivationMilestones(events: MilestoneEvent[]): ActivationMilestones {
  const byMilestone = new Map<ActivationMilestone, Set<string>>();
  for (const key of Object.keys(ACTIVATION_MILESTONES) as ActivationMilestone[]) {
    byMilestone.set(key, new Set());
  }
  const eventToMilestone = new Map<string, ActivationMilestone>(
    (Object.entries(ACTIVATION_MILESTONES) as [ActivationMilestone, string][]).map(
      ([milestone, event]) => [event, milestone],
    ),
  );

  let failureEvents = 0;
  let resolutionEvents = 0;
  const failureSet = new Set<string>(FAILURE_EVENTS);

  for (const e of events) {
    const milestone = eventToMilestone.get(e.event_name);
    if (milestone) byMilestone.get(milestone)!.add(e.organization_id);
    if (failureSet.has(e.event_name)) failureEvents++;
    if (e.event_name === ACTIVATION_MILESTONES.action_center_resolution) resolutionEvents++;
  }

  const reach = {} as Record<ActivationMilestone, number>;
  for (const [milestone, orgs] of byMilestone) reach[milestone] = orgs.size;

  return { reach, failureEvents, resolutionEvents };
}
