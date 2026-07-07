import {
  ENTITLEMENT_REASONS,
  ORG_ACCESS_STATES,
  WRITABLE_ACCESS_STATES,
  type ClaimTrialResult,
  type EntitlementReason,
  type OrgAccessState,
  type TrialEligibility,
} from "../types/entitlement.types";

/**
 * Pure parsers for the entitlement RPC JSONB payloads (migration 089).
 * Fail-closed: any unexpected/malformed shape is treated as the safest
 * denial. Real enforcement lives in the DB (unique constraints + RPC), so a
 * conservative UX default never grants access it shouldn't.
 */

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function isReason(value: unknown): value is EntitlementReason {
  return typeof value === "string" && (ENTITLEMENT_REASONS as readonly string[]).includes(value);
}

/** Parse get_trial_eligibility_for_current_user() → TrialEligibility. */
export function parseTrialEligibilityV2(raw: unknown): TrialEligibility {
  const obj = asRecord(raw);
  if (obj) {
    const { eligible, reason } = obj;
    if (eligible === true && reason === "never_used") {
      return { eligible: true, reason: "never_used" };
    }
    if (eligible === false && isReason(reason) && reason !== "never_used") {
      return { eligible: false, reason };
    }
  }
  // Fail-closed: unknown payload → not eligible for an ambiguous reason.
  return { eligible: false, reason: "trial_not_available" };
}

/** Parse claim_trial_for_current_user(org) → ClaimTrialResult. */
export function parseClaimTrialResult(raw: unknown): ClaimTrialResult {
  const obj = asRecord(raw);
  if (obj && isReason(obj.reason)) {
    const accessState = parseAccessStateValue(obj.access_state);
    return {
      ok: obj.ok === true,
      reason: obj.reason,
      ...(accessState ? { accessState } : {}),
    };
  }
  return { ok: false, reason: "internal_error" };
}

function parseAccessStateValue(value: unknown): OrgAccessState | undefined {
  return typeof value === "string" && (ORG_ACCESS_STATES as readonly string[]).includes(value)
    ? (value as OrgAccessState)
    : undefined;
}

/** Parse get_organization_access_state(org) → OrgAccessState (defaults to no_org). */
export function parseAccessState(raw: unknown): OrgAccessState {
  return parseAccessStateValue(raw) ?? "no_org";
}

/** Whether business writes are allowed in a given access state. */
export function isWritableAccessState(state: OrgAccessState): boolean {
  return (WRITABLE_ACCESS_STATES as readonly string[]).includes(state);
}

/**
 * True only when the current identity is ineligible *because it already used
 * its trial* — i.e. the "choose a paid plan" UX case. Deliberately excludes
 * `developer_unlimited` (no trial needed) and `verified_email_required` /
 * `auth_required` (not a used trial), so those users never see a misleading
 * "trial already used" message.
 */
export function isTrialAlreadyUsed(result: TrialEligibility): boolean {
  return !result.eligible
    && (result.reason === "trial_claimed" || result.reason === "trial_already_used");
}
