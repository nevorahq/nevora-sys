/**
 * Entitlement control-plane contract (migration 089).
 *
 * Typed mirror of the DB RPCs:
 *   - get_trial_eligibility_for_current_user() → TrialEligibility
 *   - claim_trial_for_current_user(org)        → ClaimTrialResult
 *   - get_organization_access_state(org)        → OrgAccessState
 *
 * Identity and organization context are derived server-side from auth.uid()
 * inside the RPCs — never from client payload. These types exist so the app
 * can consume the typed reason codes instead of parsing raw JSONB.
 */

/** Reason codes returned by the entitlement RPCs. Superset across functions. */
export type EntitlementReason =
  | "auth_required"
  | "verified_email_required"
  | "organization_required"
  | "membership_required"
  | "permission_denied"
  | "trial_claimed"
  | "trial_already_used"
  | "trial_not_available"
  | "billing_state_invalid"
  | "developer_unlimited"
  | "never_used"
  | "internal_error";

/** Organization access states (get_organization_access_state). */
export type OrgAccessState =
  | "no_org"
  | "trialing"
  | "trial_expired"
  | "paid_active"
  | "payment_past_due"
  | "payment_grace"
  | "payment_unpaid"
  | "canceled"
  | "suspended"
  | "security_hold"
  | "developer_unlimited"
  | "requires_paid_plan";

export type TrialEligibility =
  | { eligible: true; reason: "never_used" }
  | { eligible: false; reason: Exclude<EntitlementReason, "never_used"> };

export interface ClaimTrialResult {
  ok: boolean;
  reason: EntitlementReason;
  accessState?: OrgAccessState;
}

export const ORG_ACCESS_STATES: readonly OrgAccessState[] = [
  "no_org",
  "trialing",
  "trial_expired",
  "paid_active",
  "payment_past_due",
  "payment_grace",
  "payment_unpaid",
  "canceled",
  "suspended",
  "security_hold",
  "developer_unlimited",
  "requires_paid_plan",
] as const;

export const ENTITLEMENT_REASONS: readonly EntitlementReason[] = [
  "auth_required",
  "verified_email_required",
  "organization_required",
  "membership_required",
  "permission_denied",
  "trial_claimed",
  "trial_already_used",
  "trial_not_available",
  "billing_state_invalid",
  "developer_unlimited",
  "never_used",
  "internal_error",
] as const;

/** Access states in which business writes are allowed (mirror of can_write_org intent). */
export const WRITABLE_ACCESS_STATES: readonly OrgAccessState[] = [
  "trialing",
  "paid_active",
  "payment_past_due",
  "payment_grace",
  "developer_unlimited",
] as const;
