// First Action Wizard — the Phase B first-run experience inside the dashboard.
//
//   pick a first action -> create the entity in its own module
//     -> Nevora seeds a draft (reconcileFirstAction, on the next Action Center render)
//     -> user reviews and confirms -> activation
//
// Distinct from `features/onboarding`, which is the pre-dashboard screen where a
// user creates their organization. This module owns no creation forms and never
// mutates business data — a confirm goes through the planner's accept path.

export {
  FIRST_ACTIONS,
  isFirstAction,
  wizardStep,
  shouldShowWizard,
  ONBOARDING_PROGRESS_COLUMNS,
} from "./types/onboarding.types";
export type { FirstAction, OnboardingProgress, WizardStep } from "./types/onboarding.types";

export { planFirstActionDraft } from "./services/plan-first-action-draft";
export type { FirstActionEntity } from "./services/plan-first-action-draft";
export { ensureOnboardingProgress } from "./services/ensure-onboarding-progress";
export { reconcileFirstAction } from "./services/reconcile-first-action";

export { getWizardState } from "./queries/get-wizard-state";
export type { WizardState } from "./queries/get-wizard-state";

export { selectFirstActionAction } from "./actions/select-first-action.action";
export { dismissWizardAction } from "./actions/dismiss-wizard.action";

export { FIRST_ACTION_ROUTE } from "./constants/first-action-routes";

export { FirstActionWizard } from "./components/first-action-wizard";
export { FirstActionCta } from "./components/first-action-cta";
