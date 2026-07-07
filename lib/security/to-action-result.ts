import type { ActionResult } from "@/lib/validators/common";
import { AccessError, isAccessError, type AccessErrorCode } from "./access-errors";

/**
 * Bridge a thrown `AccessError` back into the standard `ActionResult` the
 * client already understands (`{ error }`). Non-AccessErrors are re-thrown so
 * genuine bugs still surface / get logged by the platform.
 *
 * Usage in a Server Action:
 *
 *   try {
 *     const ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
 *     // ...mutation...
 *   } catch (err) {
 *     const denied = accessErrorToActionResult(err);
 *     if (denied) return denied;
 *     throw err;
 *   }
 */
export function accessErrorToActionResult(err: unknown): ActionResult | null {
  if (!isAccessError(err)) return null;
  return { error: err.message };
}

/** Same, but always returns a result (defaults unknown errors to a safe message). */
export function toActionResult(err: unknown, fallback = "Server error"): ActionResult {
  if (isAccessError(err)) return { error: err.message };
  return { error: fallback };
}

/** Re-export for callers that want to branch on a specific code. */
export type { AccessErrorCode };
export { AccessError };
