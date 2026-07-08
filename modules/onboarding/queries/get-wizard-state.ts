import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import {
  shouldShowWizard,
  wizardStep,
  type FirstAction,
  type WizardStep,
} from "../types/onboarding.types";
import { ensureOnboardingProgress } from "../services/ensure-onboarding-progress";
import { reconcileFirstAction } from "../services/reconcile-first-action";

export interface WizardState {
  visible: boolean;
  step: WizardStep;
  selectedAction: FirstAction | null;
  /** planner_suggestions.id awaiting review, when step is 'review_draft'. */
  draftId: string | null;
}

/** Nothing to show, and nothing was written. */
const HIDDEN: WizardState = { visible: false, step: "done", selectedAction: null, draftId: null };

/**
 * Everything the First Action Wizard needs, and the only place the funnel
 * advances. Called once per Action Center render.
 *
 * Fails soft: onboarding is a nicety, and a broken funnel row must never take the
 * primary operating screen down with it. Every failure path returns HIDDEN.
 */
export async function getWizardState(
  supabase: SupabaseClient,
  ctx: CurrentContext,
): Promise<WizardState> {
  let progress = await ensureOnboardingProgress(supabase, ctx);
  if (!progress) return HIDDEN;

  // Skip the reconcile round-trips for users who are done or opted out.
  if (!shouldShowWizard(progress)) return HIDDEN;

  try {
    progress = await reconcileFirstAction(supabase, ctx, progress);
  } catch (error) {
    console.error("[getWizardState] reconcile failed:", error);
    // Fall through with the un-reconciled row: the wizard still renders a usable
    // step, and the next visit retries.
  }

  if (!shouldShowWizard(progress)) return HIDDEN;

  return {
    visible: true,
    step: wizardStep(progress),
    selectedAction: progress.selected_first_action,
    draftId: progress.first_draft_id,
  };
}
