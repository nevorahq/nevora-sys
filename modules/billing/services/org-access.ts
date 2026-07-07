import { evaluateEntitlement } from "@/lib/security/entitlements";
import { accessErrorMessage } from "@/lib/security/access-errors";
import type { OrgAccessState } from "../types/entitlement.types";

/**
 * UI-facing view of the organization's access state (Phase 3).
 *
 * Pure derivation from the typed `OrgAccessState` (get_organization_access_state,
 * 089) using the SAME entitlement matrix the backend gate uses (`lib/security`).
 * That single source of truth is why UI and backend can never disagree: a button
 * is disabled iff `requireAppAccess` would reject the same intent.
 *
 * This is UX only — never a security boundary. Fail-open here is safe because
 * every write is independently blocked by the gate + RLS.
 */
export interface OrgAccessCapabilities {
  accessState: OrgAccessState;
  /** Create/update/delete core business data. */
  canWrite: boolean;
  /** Invite members. */
  canInvite: boolean;
  /** Run side-effecting actions (AI/automation/financial execute). */
  canExecute: boolean;
  /** Convenience: writes are blocked → the workspace is effectively read-only. */
  isRestricted: boolean;
  /** Friendly, PII-free explanation for the blocked state (empty when writable). */
  reason: string;
}

/** The three intents the UI can gate on. */
export type OrgAccessIntent = "write" | "invite" | "execute";

/**
 * Derive UI capabilities from an access state. Reuses the backend matrix +
 * message catalogue so copy and decisions stay in lockstep with the gate.
 */
export function resolveOrgAccessCapabilities(
  accessState: OrgAccessState,
): OrgAccessCapabilities {
  const write = evaluateEntitlement(accessState, "write");
  const invite = evaluateEntitlement(accessState, "invite");
  const execute = evaluateEntitlement(accessState, "execute");

  return {
    accessState,
    canWrite: write.allowed,
    canInvite: invite.allowed,
    canExecute: execute.allowed,
    isRestricted: !write.allowed,
    reason: write.allowed ? "" : accessErrorMessage(write.code ?? "BILLING_REQUIRED"),
  };
}

/** Whether a specific intent is allowed under the given capabilities. */
export function isIntentAllowed(
  caps: OrgAccessCapabilities,
  intent: OrgAccessIntent,
): boolean {
  return intent === "invite" ? caps.canInvite : intent === "execute" ? caps.canExecute : caps.canWrite;
}
