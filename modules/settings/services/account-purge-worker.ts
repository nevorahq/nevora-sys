import "server-only";

import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";
import { evaluateAccountDeletion } from "./account-deletion-guard";

export interface AccountPurgeResult {
  scanned: number;
  purged: number;
  /** Requests whose sole-owner guard now blocks; left pending for a later sweep. */
  skipped: number;
  errors: number;
}

/**
 * Hard-delete accounts whose grace window has elapsed.
 *
 * For each pending request past its `purge_after`:
 *   1. re-run the sole-owner guard (org membership can change during the 30-day
 *      window); if it now blocks, skip and leave the request pending;
 *   2. cascade-delete the user's solo organizations (organizations.created_by is
 *      SET NULL — deleting the user alone would leave them ownerless);
 *   3. auth.admin.deleteUser() — safe thanks to the FK cleanup in migrations
 *      102/103 (every FK to auth.users is CASCADE or SET-NULL-on-nullable);
 *   4. flip the request to 'purged'.
 *
 * Runs under the service-role client (RLS-bypassing); there is no user session.
 * Idempotent per request: a crash mid-loop leaves the row 'pending' and the next
 * sweep retries it.
 */
export async function runAccountPurgeSweep(): Promise<AccountPurgeResult> {
  const admin = getServiceRoleClient();
  if (!admin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  const nowIso = new Date().toISOString();
  const { data: due, error } = await admin
    .from("account_deletion_requests")
    .select("id, user_id")
    .eq("status", "pending")
    .lte("purge_after", nowIso);

  if (error) {
    throw new Error(`Failed to load due deletion requests: ${error.message}`);
  }

  const result: AccountPurgeResult = {
    scanned: due?.length ?? 0,
    purged: 0,
    skipped: 0,
    errors: 0,
  };

  for (const request of due ?? []) {
    const userId = request.user_id as string;
    const requestId = request.id as string;
    try {
      const guard = await evaluateAccountDeletion(userId);
      if (guard.blocking.length > 0) {
        result.skipped += 1;
        logger.warn("cron.account_purge.skipped_blocked", {
          requestId,
          blockingOrgs: guard.blocking.length,
        });
        continue;
      }

      // 1. Cascade-delete solo organizations.
      for (const orgId of guard.soloOrganizationIds) {
        const { error: orgError } = await admin
          .from("organizations")
          .delete()
          .eq("id", orgId);
        if (orgError) {
          throw new Error(`org ${orgId}: ${orgError.message}`);
        }
      }

      // 2. Hard-delete the auth user.
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
      if (deleteError) {
        throw new Error(`deleteUser: ${deleteError.message}`);
      }

      // 3. Mark purged. (The user_id FK is ON DELETE CASCADE, so the row may be
      //    gone already; update is a best-effort audit close-out.)
      await admin
        .from("account_deletion_requests")
        .update({ status: "purged", purged_at: new Date().toISOString() })
        .eq("id", requestId);

      result.purged += 1;
    } catch (err) {
      result.errors += 1;
      logger.error("cron.account_purge.request_failed", {
        requestId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
