/**
 * Trial Reuse Protection — контракт eligibility (migration 086).
 *
 * Право на trial принадлежит billing owner identity
 * (user_id + normalized_email_hash + будущий billing_customer_id),
 * а не организации. Источник правды — RPC check_trial_eligibility()
 * поверх billing_trial_claims; enforcement — unique-констрейнты +
 * init_trial_subscription() внутри create_organization().
 */

export type TrialIneligibleReason =
  | "trial_active"
  | "trial_consumed"
  | "trial_blocked"
  | "billing_identity_already_used";

export type TrialEligibilityResult =
  | { eligible: true; reason: "never_used" }
  | { eligible: false; reason: TrialIneligibleReason };

export type TrialClaimStatus = "active" | "consumed" | "blocked";

export interface TrialClaim {
  id: string;
  user_id: string;
  organization_id: string | null;
  status: TrialClaimStatus;
  trial_started_at: string;
  trial_ended_at: string | null;
  trial_consumed_at: string | null;
}
