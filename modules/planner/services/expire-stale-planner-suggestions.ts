import "server-only";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";

/**
 * Planner sweep (Phase B / B4). Three repairs, in the order they must run:
 *
 *   1. reconcile — a confirm that crashed mid-flight left a suggestion claimed as
 *      'processing'. Release it back to 'pending' if no entity was recorded, or
 *      finalize it to 'accepted' if one was. Runs FIRST so the rows it releases
 *      are visible to the two expiry passes below in the same sweep.
 *   2. orphaned  — the entity a suggestion came from was deleted, so the
 *      suggestion can never be meaningfully confirmed (Phase B edge case #2).
 *   3. stale     — a pending/edited suggestion older than the TTL, so the review
 *      queue never accumulates AI output nobody will ever look at.
 *
 * Business entities are never touched: expiring a suggestion only removes a
 * proposal, and this layer has no path to a money transaction (migration 080).
 *
 * Runs cross-org, so it uses the service-role client — the same established
 * exception as the money suggestions sweep and the extraction worker; application
 * actions never use service role. Steps 1 and 2 go through SECURITY DEFINER RPCs
 * (migration 094) that are granted to service_role only.
 *
 * Scheduled via vercel.json → /api/cron/suggestions-sweep (daily), alongside the
 * money suggestions sweep. To run it manually:
 *   curl -H "Authorization: Bearer $CRON_SECRET" <host>/api/cron/suggestions-sweep
 */

/** Matches the money suggestions TTL — the two review queues age alike. */
export const PLANNER_SUGGESTION_TTL_DAYS = 30;

/**
 * How long a claim may sit in 'processing' before it is treated as crashed. Must
 * comfortably exceed the slowest accept (an AI-assisted module service round
 * trip), or the sweep would release claims that are still doing useful work.
 */
export const PLANNER_CLAIM_TIMEOUT_MINUTES = 15;

/** Cap per run so a huge backlog can't blow the cron time budget. */
const SWEEP_BATCH_LIMIT = 500;

export interface PlannerSweepResult {
  ok: boolean;
  /** Crashed claims returned to 'pending' (no entity had been recorded). */
  released: number;
  /** Crashed claims completed to 'accepted' (the entity existed). */
  finalized: number;
  /** Expired because the source entity was deleted. */
  orphaned: number;
  /** Expired because they outlived the TTL. */
  stale: number;
  /** false when no service-role client is configured (sweep can't run). */
  configured: boolean;
}

const EMPTY: Omit<PlannerSweepResult, "ok" | "configured"> = {
  released: 0,
  finalized: 0,
  orphaned: 0,
  stale: 0,
};

export async function expireStalePlannerSuggestions(
  ttlDays: number = PLANNER_SUGGESTION_TTL_DAYS,
): Promise<PlannerSweepResult> {
  const log = logger.child({ scope: "planner_sweep" });
  const supabase = getServiceRoleClient();
  if (!supabase) {
    log.warn("skipped.no_service_role");
    return { ok: false, ...EMPTY, configured: false };
  }

  // ── 1. Reconcile crashed claims ────────────────────────────────────────────
  let released = 0;
  let finalized = 0;
  const { data: reconciled, error: reconcileError } = await supabase.rpc(
    "reconcile_stuck_planner_suggestions",
    { p_timeout_minutes: PLANNER_CLAIM_TIMEOUT_MINUTES, p_limit: SWEEP_BATCH_LIMIT },
  );

  if (reconcileError) {
    // A stuck claim is invisible to the user but harmless; the expiry passes are
    // still worth running, so this degrades rather than aborts.
    log.error("reconcile_failed", { error: reconcileError.message });
  } else {
    // RETURNS TABLE(...) surfaces as a one-row array through PostgREST.
    const row = Array.isArray(reconciled) ? reconciled[0] : reconciled;
    released = Number(row?.released ?? 0);
    finalized = Number(row?.finalized ?? 0);
  }

  // ── 2. Expire orphaned suggestions (source entity deleted) ─────────────────
  let orphaned = 0;
  const { data: orphanCount, error: orphanError } = await supabase.rpc(
    "expire_orphaned_planner_suggestions",
    { p_limit: SWEEP_BATCH_LIMIT },
  );

  if (orphanError) {
    log.error("orphan_expiry_failed", { error: orphanError.message });
    return { ok: false, released, finalized, orphaned: 0, stale: 0, configured: true };
  }
  orphaned = Number(orphanCount ?? 0);

  // ── 3. Expire suggestions past the TTL ─────────────────────────────────────
  const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000).toISOString();

  // Select-then-update keeps the batch bounded and yields the rows we need for
  // domain events without a second read.
  const { data: staleRows, error: selectError } = await supabase
    .from("planner_suggestions")
    .select("id, organization_id, workspace_id, planner_entry_id, suggestion_type")
    .in("status", ["pending", "edited"])
    .lt("created_at", cutoff)
    .limit(SWEEP_BATCH_LIMIT);

  if (selectError) {
    log.error("stale_select_failed", { error: selectError.message });
    return { ok: false, released, finalized, orphaned, stale: 0, configured: true };
  }
  if (!staleRows || staleRows.length === 0) {
    log.info("done", { released, finalized, orphaned, stale: 0, ttlDays });
    return { ok: true, released, finalized, orphaned, stale: 0, configured: true };
  }

  const ids = staleRows.map((row) => row.id as string);
  const { error: updateError } = await supabase
    .from("planner_suggestions")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .in("id", ids)
    // Re-assert the guard: a user may have accepted one of these between the
    // select and this update.
    .in("status", ["pending", "edited"]);

  if (updateError) {
    log.error("stale_update_failed", { error: updateError.message });
    return { ok: false, released, finalized, orphaned, stale: 0, configured: true };
  }

  // Compact per-suggestion events (no raw AI output, no user text). Bulk insert —
  // the automation dispatcher is user-context-bound and intentionally skipped.
  const { error: eventsError } = await supabase.from("domain_events").insert(
    staleRows.map((row) => ({
      organization_id: row.organization_id,
      workspace_id: row.workspace_id,
      event_name: "planner_suggestion.expired",
      aggregate_type: "planner_suggestion",
      aggregate_id: row.id,
      payload: { reason: "ttl", suggestion_type: row.suggestion_type },
    })),
  );
  if (eventsError) log.warn("events_insert_failed", { error: eventsError.message });

  log.info("done", { released, finalized, orphaned, stale: ids.length, ttlDays });
  return { ok: true, released, finalized, orphaned, stale: ids.length, configured: true };
}
