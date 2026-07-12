/**
 * Shared constants for the self-service account deletion flow. Imported by the
 * Server Action, the cron purge, and the UI, so the grace window is defined in
 * exactly one place.
 */

/** Length of the reversible grace window between request and hard purge. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

/** purge_after for a request created now. */
export function computePurgeAfter(from: Date = new Date()): Date {
  const purge = new Date(from);
  purge.setUTCDate(purge.getUTCDate() + ACCOUNT_DELETION_GRACE_DAYS);
  return purge;
}
