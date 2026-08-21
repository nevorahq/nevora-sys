import "server-only";

/**
 * Product-neutral server access boundary.
 *
 * Product modules depend on this facade instead of coupling themselves to the
 * current billing and security implementation. The implementation can move to
 * a workspace package later without changing every product action.
 */
export {
  requireAppAccess,
  accessErrorToActionResult,
  isAccessError,
} from "@/lib/security";
export type {
  AppAccessContext,
  RequireAppAccessOptions,
} from "@/lib/security/require-app-access";

export {
  reserveOrganizationUsage,
  releaseOrganizationUsage,
} from "@/modules/billing";
