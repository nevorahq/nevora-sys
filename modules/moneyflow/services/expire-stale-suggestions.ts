import "server-only";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";

/**
 * Suggestions sweep (Phase 5.1 §4.4): pending money_ai_suggestions older than
 * the TTL flip to 'expired' so the review queue never accumulates stale AI
 * output. Transactions are NOT touched — an expired suggestion simply leaves
 * its transaction in the uncategorized queue, where re-categorization can run.
 *
 * Runs cross-org, so it uses the service-role client — the same established
 * exception as the extraction sweep (modules/documents/services/
 * extraction-worker.ts); application actions never use service role.
 *
 * Scheduled via vercel.json → /api/cron/suggestions-sweep (daily). To run it
 * manually: `curl -H "Authorization: Bearer $CRON_SECRET" <host>/api/cron/suggestions-sweep`
 * or execute the equivalent SQL:
 *   update money_ai_suggestions set status='expired'
 *   where status='pending' and created_at < now() - interval '30 days';
 */

export const SUGGESTION_TTL_DAYS = 30;

/** Cap per run so a huge backlog can't blow the cron time budget. */
const SWEEP_BATCH_LIMIT = 500;

export interface SuggestionsSweepResult {
  ok: boolean;
  expired: number;
  /** false when no service-role client is configured (sweep can't run). */
  configured: boolean;
}

export async function expireStaleSuggestions(
  ttlDays: number = SUGGESTION_TTL_DAYS,
): Promise<SuggestionsSweepResult> {
  const log = logger.child({ scope: "suggestions_sweep" });
  const supabase = getServiceRoleClient();
  if (!supabase) {
    log.warn("skipped.no_service_role");
    return { ok: false, expired: 0, configured: false };
  }

  const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000).toISOString();

  // Select-then-update keeps the batch bounded and yields the rows we need
  // for domain events without a second read.
  const { data: stale, error: selectError } = await supabase
    .from("money_ai_suggestions")
    .select("id, organization_id, workspace_id, transaction_id, source")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .limit(SWEEP_BATCH_LIMIT);

  if (selectError) {
    log.error("select_failed", { error: selectError.message });
    return { ok: false, expired: 0, configured: true };
  }
  if (!stale || stale.length === 0) {
    return { ok: true, expired: 0, configured: true };
  }

  const ids = stale.map((row) => row.id as string);
  const { error: updateError } = await supabase
    .from("money_ai_suggestions")
    .update({ status: "expired", reviewed_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "pending");

  if (updateError) {
    log.error("update_failed", { error: updateError.message });
    return { ok: false, expired: 0, configured: true };
  }

  // Compact per-suggestion events (no raw AI output). Bulk insert — the
  // automation dispatcher is user-context-bound and intentionally skipped here.
  const { error: eventsError } = await supabase.from("domain_events").insert(
    stale.map((row) => ({
      organization_id: row.organization_id,
      workspace_id: row.workspace_id,
      event_name: "money.ai_suggestion.expired",
      aggregate_type: "money_ai_suggestion",
      aggregate_id: row.id,
      payload: { transaction_id: row.transaction_id, source: row.source },
    })),
  );
  if (eventsError) log.warn("events_insert_failed", { error: eventsError.message });

  log.info("done", { expired: ids.length, ttlDays });
  return { ok: true, expired: ids.length, configured: true };
}
