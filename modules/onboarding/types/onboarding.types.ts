/**
 * First Action Wizard — domain types (Phase B / B2).
 *
 * Not to be confused with `features/onboarding`, which is the *pre-dashboard*
 * screen where a user creates their organization. This module is the first-run
 * experience INSIDE the dashboard: pick one of four allowed first actions, let
 * Nevora prepare a draft, review it, confirm it.
 *
 * Mirrors the CHECK dictionary of migration 095.
 */

/** The four allowed first actions (Phase B / B0 scope lock). No others. */
export const FIRST_ACTIONS = [
  "upload_document",
  "add_subscription",
  "create_task",
  "capture_inbox_item",
] as const;
export type FirstAction = (typeof FIRST_ACTIONS)[number];

export function isFirstAction(value: string): value is FirstAction {
  return (FIRST_ACTIONS as readonly string[]).includes(value);
}

/**
 * Where the user started their first action. Phase B / B7 asks for an "empty state
 * CTA click rate", which is unanswerable unless the two entry points are
 * distinguishable at the moment of the click.
 */
export const FIRST_ACTION_SOURCES = ["wizard", "empty_state"] as const;
export type FirstActionSource = (typeof FIRST_ACTION_SOURCES)[number];

export interface OnboardingProgress {
  id: string;
  organization_id: string;
  user_id: string;
  selected_first_action: FirstAction | null;
  /** planner_entries.id seeded for the first action — the idempotency witness. */
  first_entry_id: string | null;
  /** planner_suggestions.id of the draft the first action produced. */
  first_draft_id: string | null;
  started_at: string;
  selected_at: string | null;
  first_action_completed_at: string | null;
  first_workflow_completed_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const ONBOARDING_PROGRESS_COLUMNS =
  "id, organization_id, user_id, selected_first_action, first_entry_id, first_draft_id, started_at, selected_at, first_action_completed_at, first_workflow_completed_at, dismissed_at, created_at, updated_at" as const;

/**
 * Which step the wizard should render. Derived from the timestamps rather than
 * stored, so there is exactly one source of truth (migration 095's header).
 */
export type WizardStep =
  /** No action picked yet — show the four tiles. */
  | "choose"
  /** Action picked, entity not created yet — send the user to the creation surface. */
  | "awaiting_entity"
  /** Entity exists and a draft is waiting — send the user to review it. */
  | "review_draft"
  /** Draft confirmed. The wizard is done and hides itself. */
  | "done";

export function wizardStep(progress: OnboardingProgress): WizardStep {
  if (progress.first_workflow_completed_at) return "done";
  if (!progress.selected_first_action) return "choose";
  if (!progress.first_action_completed_at) return "awaiting_entity";
  return "review_draft";
}

/**
 * Whether the wizard should be rendered at all. A dismissed wizard stays hidden
 * even mid-funnel (Phase B edge case #6: the first actions remain reachable from
 * the Action Center, just not as a wizard).
 */
export function shouldShowWizard(progress: OnboardingProgress | null): boolean {
  if (!progress) return true;
  if (progress.dismissed_at) return false;
  return wizardStep(progress) !== "done";
}
