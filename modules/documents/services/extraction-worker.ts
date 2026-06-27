import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger, type Logger } from "@/lib/observability/logger";
import { runDocumentExtraction } from "./document-extraction-service";

/**
 * Durable extraction sweep — the safety net behind the `after()` fast path.
 *
 * `after()` is best-effort: a process restart or crash can drop the callback,
 * leaving a job stuck. Two failure modes are recovered here, cross-org, via the
 * service-role client (RLS-bypassing, so it can see every tenant's jobs):
 *
 *   1. STALE PROCESSING — claimed (pending→processing) but never finished
 *      (crashed mid-run). Forced to a terminal `failed` state so the document's
 *      in-flight lock (migration 051) is released and the user can retry.
 *   2. LOST PENDING — enqueued but never claimed (`after()` never fired, so
 *      `started_at` is still null). These are actually RUN to completion, making
 *      the pipeline self-healing. Batched (`pickupLimit`) to bound cost/time.
 *
 * Intended to be invoked periodically (cron) — see app/api/cron/extraction-sweep.
 */

/** A processing job older than this is considered crashed. Mirrors the inline reaper. */
const STALE_PROCESSING_MS = 10 * 60 * 1000;
/** A pending job older than this never got picked up by `after()`. */
const LOST_PENDING_MS = 2 * 60 * 1000;
const DEFAULT_PICKUP_LIMIT = 5;

export interface SweepResult {
  /** false when no service-role client is configured (sweep can't run). */
  ran: boolean;
  reaped: number;
  recovered: number;
  recoveryFailures: number;
}

export async function runExtractionSweep(
  opts: { pickupLimit?: number; client?: SupabaseClient } = {},
): Promise<SweepResult> {
  const log = logger.child({ scope: "extraction-sweep" });
  const supabase = opts.client ?? getServiceRoleClient();
  if (!supabase) {
    log.warn("skipped.no_service_role");
    return { ran: false, reaped: 0, recovered: 0, recoveryFailures: 0 };
  }

  const reaped = await reapStaleProcessing(supabase, log);
  const { recovered, recoveryFailures } = await recoverLostPending(
    supabase,
    log,
    opts.pickupLimit ?? DEFAULT_PICKUP_LIMIT,
  );

  log.info("done", { reaped, recovered, recoveryFailures });
  return { ran: true, reaped, recovered, recoveryFailures };
}

async function reapStaleProcessing(supabase: SupabaseClient, log: Logger): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const { data, error } = await supabase
    .from("document_extractions")
    .update({
      status: "failed",
      error_code: "unknown_error",
      error_message: "Extraction timed out and was reset by the sweep worker.",
      completed_at: new Date().toISOString(),
    })
    .eq("status", "processing")
    .lt("started_at", cutoff)
    .select("id");
  if (error) {
    log.error("reap.failed", { error: error.message });
    return 0;
  }
  const count = data?.length ?? 0;
  if (count) log.info("reaped", { count });
  return count;
}

async function recoverLostPending(
  supabase: SupabaseClient,
  log: Logger,
  limit: number,
): Promise<{ recovered: number; recoveryFailures: number }> {
  const cutoff = new Date(Date.now() - LOST_PENDING_MS).toISOString();
  const { data, error } = await supabase
    .from("document_extractions")
    .select("id, document_id, organization_id, workspace_id, created_by")
    .eq("status", "pending")
    .is("started_at", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    log.error("pickup.failed", { error: error.message });
    return { recovered: 0, recoveryFailures: 0 };
  }

  let recovered = 0;
  let recoveryFailures = 0;
  for (const row of data ?? []) {
    const orgId = row.organization_id as string | null;
    const workspaceId = row.workspace_id as string | null;
    const userId = row.created_by as string | null;
    // Can't safely reconstruct tenant scope without these — skip rather than guess.
    if (!orgId || !workspaceId || !userId) {
      recoveryFailures++;
      log.warn("recover.skipped_incomplete_scope", { extractionId: row.id as string });
      continue;
    }

    const ctx = {
      user: { id: userId },
      org: { id: orgId },
      workspace: { id: workspaceId },
    } as unknown as CurrentContext;

    try {
      const result = await runDocumentExtraction(supabase, ctx, row.document_id as string, row.id as string);
      if (result.ok || result.status === "needs_review") recovered++;
      else recoveryFailures++;
    } catch (e) {
      recoveryFailures++;
      log.error("recover.threw", {
        extractionId: row.id as string,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  if (recovered || recoveryFailures) log.info("recovered", { recovered, recoveryFailures });
  return { recovered, recoveryFailures };
}
