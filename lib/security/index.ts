/**
 * Centralized backend security policy engine (Phase 2).
 *
 * Single entry point for user-triggered mutations:
 *   auth → org/workspace → tenant match → membership → permission →
 *   billing entitlement → plan capability → mutation → audit.
 *
 * Import `requireAppAccess` in Server Actions; on failure catch and map the
 * thrown `AccessError` with `accessErrorToActionResult`.
 */

export { requireAppAccess } from "./require-app-access";
export type { RequireAppAccessOptions, AppAccessContext } from "./require-app-access";

export {
  AccessError,
  isAccessError,
  accessErrorMessage,
  ACCESS_ERROR_CODES,
} from "./access-errors";
export type { AccessErrorCode } from "./access-errors";

export { evaluateEntitlement, canWriteInState } from "./entitlements";
export type { AccessIntent, EntitlementDecision } from "./entitlements";

export { PERMISSIONS, hasPermission } from "./permissions";
export type { AppPermission } from "./permissions";

export { auditSecurityEvent } from "./audit-security-event";
export type { SecurityEventInput } from "./audit-security-event";

export { accessErrorToActionResult, toActionResult } from "./to-action-result";

export { redactFilenameForEvent } from "./redact-filename";
