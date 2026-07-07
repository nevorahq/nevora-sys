/**
 * Typed access errors for the centralized authorization gate (Phase 2).
 *
 * The database (RLS + can_write_org + is_organization_writable, migrations
 * 002/027/086/089) is the authoritative boundary. This app-layer error taxonomy
 * exists so Server Actions can distinguish *why* a mutation was refused —
 * a missing permission vs an expired trial vs a past-due invoice all render
 * different UX — without leaking that decision-making into every action.
 *
 * Every code maps to a friendly, PII-free default message. Actions surface
 * these via `accessErrorToActionResult()` which yields the standard
 * `ActionResult` shape the client already understands.
 */

/** Discriminated set of reasons a guarded action can be refused. */
export type AccessErrorCode =
  | "AUTH_REQUIRED"
  | "ORG_REQUIRED"
  | "WORKSPACE_REQUIRED"
  | "MEMBERSHIP_REQUIRED"
  | "PERMISSION_DENIED"
  | "BILLING_REQUIRED"
  | "TRIAL_EXPIRED"
  | "PLAN_REQUIRED"
  | "LIMIT_REACHED"
  | "PAYMENT_REQUIRED"
  | "PAYMENT_PAST_DUE"
  | "ORGANIZATION_SUSPENDED"
  | "SECURITY_HOLD"
  | "INVALID_TENANT_CONTEXT";

export const ACCESS_ERROR_CODES: readonly AccessErrorCode[] = [
  "AUTH_REQUIRED",
  "ORG_REQUIRED",
  "WORKSPACE_REQUIRED",
  "MEMBERSHIP_REQUIRED",
  "PERMISSION_DENIED",
  "BILLING_REQUIRED",
  "TRIAL_EXPIRED",
  "PLAN_REQUIRED",
  "LIMIT_REACHED",
  "PAYMENT_REQUIRED",
  "PAYMENT_PAST_DUE",
  "ORGANIZATION_SUSPENDED",
  "SECURITY_HOLD",
  "INVALID_TENANT_CONTEXT",
] as const;

/** PII-free, user-facing default copy per code. */
const DEFAULT_MESSAGES: Record<AccessErrorCode, string> = {
  AUTH_REQUIRED: "Please sign in to continue.",
  ORG_REQUIRED: "No active organization is selected.",
  WORKSPACE_REQUIRED: "No active workspace is selected.",
  MEMBERSHIP_REQUIRED: "You are not an active member of this organization.",
  PERMISSION_DENIED: "You do not have permission to perform this action.",
  BILLING_REQUIRED: "A billing action is required to continue.",
  TRIAL_EXPIRED: "Your trial has ended. Choose a plan to continue editing.",
  PLAN_REQUIRED: "This action requires an active plan. Choose a plan to continue.",
  LIMIT_REACHED: "You have reached your plan limit. Upgrade your plan to add more.",
  PAYMENT_REQUIRED: "Payment is required to continue. Update your billing to restore access.",
  PAYMENT_PAST_DUE: "Your payment is past due. Update your billing to continue.",
  ORGANIZATION_SUSPENDED: "This organization is suspended. Contact support to restore access.",
  SECURITY_HOLD: "This organization is on a security hold. Contact support to continue.",
  INVALID_TENANT_CONTEXT: "The request targeted a different organization or workspace than your active one.",
};

/**
 * Error thrown by the authorization gate. Carries a stable `code` so callers
 * and tests can branch deterministically, plus a safe default message.
 */
export class AccessError extends Error {
  readonly code: AccessErrorCode;
  /** Rough HTTP status for route-handler callers. Server Actions ignore it. */
  readonly httpStatus: number;

  constructor(code: AccessErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = "AccessError";
    this.code = code;
    this.httpStatus = HTTP_STATUS[code];
    // Restore prototype chain for `instanceof` after transpile-to-ES5 targets.
    Object.setPrototypeOf(this, AccessError.prototype);
  }
}

const HTTP_STATUS: Record<AccessErrorCode, number> = {
  AUTH_REQUIRED: 401,
  ORG_REQUIRED: 400,
  WORKSPACE_REQUIRED: 400,
  MEMBERSHIP_REQUIRED: 403,
  PERMISSION_DENIED: 403,
  BILLING_REQUIRED: 402,
  TRIAL_EXPIRED: 402,
  PLAN_REQUIRED: 402,
  LIMIT_REACHED: 402,
  PAYMENT_REQUIRED: 402,
  PAYMENT_PAST_DUE: 402,
  ORGANIZATION_SUSPENDED: 403,
  SECURITY_HOLD: 403,
  INVALID_TENANT_CONTEXT: 400,
};

/** Narrow an unknown thrown value to an AccessError. */
export function isAccessError(err: unknown): err is AccessError {
  return err instanceof AccessError;
}

/** The safe, user-facing default message for a code. */
export function accessErrorMessage(code: AccessErrorCode): string {
  return DEFAULT_MESSAGES[code];
}
