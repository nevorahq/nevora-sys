/**
 * Intent × access-state entitlement matrix (Phase 2).
 *
 * Pure decision function: given the organization's typed `OrgAccessState`
 * (from `get_organization_access_state`, migration 089) and the caller's
 * `intent`, decide whether the action is permitted and, if not, which typed
 * `AccessErrorCode` explains the refusal.
 *
 * This is defense-in-depth UX plumbing, not the security boundary — the DB
 * (`can_write_org` + RLS) still authoritatively rejects any direct-API write.
 * The matrix therefore fails closed: an unknown state denies every non-read
 * intent.
 */

import type { OrgAccessState } from "@/modules/billing/types/entitlement.types";
import type { AccessErrorCode } from "./access-errors";

/**
 * What the caller is trying to do. Chosen to be coarse enough that a whole
 * class of actions shares one intent, but fine enough that billing/invite/
 * settings degrade independently of ordinary business writes.
 *
 *   read    — load/query data (and read-only reports/export)
 *   write   — create/update/delete business data
 *   invite  — add a member / send an invite
 *   billing — manage plan / payment / subscription (always reachable so a
 *             blocked org can pay its way back in)
 *   admin   — org/workspace/settings administration
 *   execute — run a side-effecting action (automation, AI apply, action-center
 *             execute); treated like `write` for entitlement purposes
 */
export type AccessIntent = "read" | "write" | "billing" | "invite" | "admin" | "execute";

export interface EntitlementDecision {
  allowed: boolean;
  /** Present only when `allowed` is false. */
  code?: AccessErrorCode;
}

/**
 * Per-state policy: the set of intents allowed, and the typed code to raise
 * when a needed intent is not in that set. `billing` and `admin` (settings)
 * stay reachable in every non-suspended degraded state so users can always
 * resolve their own billing.
 */
interface StatePolicy {
  allow: ReadonlySet<AccessIntent>;
  code: AccessErrorCode;
}

const ALL: readonly AccessIntent[] = ["read", "write", "billing", "invite", "admin", "execute"];

function policy(allow: readonly AccessIntent[], code: AccessErrorCode): StatePolicy {
  return { allow: new Set(allow), code };
}

const POLICIES: Record<OrgAccessState, StatePolicy> = {
  // Full access — code is irrelevant (nothing is ever denied here).
  developer_unlimited: policy(ALL, "PLAN_REQUIRED"),
  trialing: policy(ALL, "TRIAL_EXPIRED"),
  paid_active: policy(ALL, "PLAN_REQUIRED"),

  // Past due / grace: still paying, brief window — writes + executes continue,
  // but new invites are frozen. (Spec: "new invites disabled".)
  payment_past_due: policy(["read", "write", "execute", "billing", "admin"], "PAYMENT_PAST_DUE"),
  payment_grace: policy(["read", "write", "execute", "billing", "admin"], "PAYMENT_PAST_DUE"),

  // Trial ended / needs a paid plan: read + export + billing/settings only.
  trial_expired: policy(["read", "billing", "admin"], "TRIAL_EXPIRED"),
  requires_paid_plan: policy(["read", "billing", "admin"], "PLAN_REQUIRED"),
  canceled: policy(["read", "billing", "admin"], "PLAN_REQUIRED"),

  // Unpaid: read/export/billing only, writes fully denied.
  payment_unpaid: policy(["read", "billing", "admin"], "PAYMENT_REQUIRED"),

  // Hard holds: only billing is reachable (so support/payment can lift it);
  // read is allowed so the user can see the state and act on it.
  suspended: policy(["read", "billing"], "ORGANIZATION_SUSPENDED"),
  security_hold: policy(["read", "billing"], "SECURITY_HOLD"),

  // No resolvable org context — deny everything.
  no_org: policy([], "ORG_REQUIRED"),
};

/**
 * Decide whether `intent` is entitled under `state`.
 *
 * Fail-closed: an unrecognised state grants only `read` and denies the rest
 * with `PLAN_REQUIRED` (never silently allows a write).
 */
export function evaluateEntitlement(
  state: OrgAccessState,
  intent: AccessIntent,
): EntitlementDecision {
  const p = POLICIES[state];
  if (!p) {
    return intent === "read" ? { allowed: true } : { allowed: false, code: "PLAN_REQUIRED" };
  }
  return p.allow.has(intent) ? { allowed: true } : { allowed: false, code: p.code };
}

/** Convenience: whether a state permits ordinary business writes. */
export function canWriteInState(state: OrgAccessState): boolean {
  return evaluateEntitlement(state, "write").allowed;
}
