import "server-only";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";

/**
 * Background-job health diagnostic (Sprint 5 — S5.3 follow-up #4/#5).
 *
 * A read-only, cross-org snapshot of the two things that need eyes: jobs stuck
 * in a non-terminal `processing` state past their recovery window, and recent
 * terminal failures. System automations surface here too — they are an ops
 * concern (there is no user-facing automation builder), not a user action item.
 *
 * Aggregate counts only — no ids, no payload. Reachable only from
 * `/api/internal/job-health` (METRICS_SECRET-gated). Service role, like the other
 * cross-org internal metrics.
 */

/** Recovery windows mirror the in-code reapers (reminders 15 min, extraction 10 min). */
const REMINDER_STUCK_MIN = 15;
const EXTRACTION_STUCK_MIN = 10;
const FAILURE_WINDOW_HOURS = 24;

export interface JobHealth {
  stuckReminders: number;
  stuckExtractions: number;
  reminderFailures24h: number;
  automationFailures24h: number;
}

export type JobHealthResult =
  | { ok: true; jobHealth: JobHealth }
  | { ok: false; error: string; configured: boolean };

export async function getJobHealth(): Promise<JobHealthResult> {
  const log = logger.child({ scope: "job_health" });
  const supabase = getServiceRoleClient();
  if (!supabase) {
    log.warn("skipped.no_service_role");
    return { ok: false, error: "Service role is not configured.", configured: false };
  }

  const now = Date.now();
  const reminderCutoff = new Date(now - REMINDER_STUCK_MIN * 60_000).toISOString();
  const extractionCutoff = new Date(now - EXTRACTION_STUCK_MIN * 60_000).toISOString();
  const failureCutoff = new Date(now - FAILURE_WINDOW_HOURS * 3_600_000).toISOString();

  const headCount = async (build: () => PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count, error } = await build();
    if (error) throw error;
    if (count === null) throw new Error("Aggregate count was not returned.");
    return count;
  };

  try {
    const [stuckReminders, stuckExtractions, reminderFailures24h, automationFailures24h] = await Promise.all([
      headCount(() =>
        supabase.from("reminder_schedules").select("id", { count: "exact", head: true })
          .eq("status", "processing").lt("last_attempt_at", reminderCutoff),
      ),
      headCount(() =>
        supabase.from("document_extractions").select("id", { count: "exact", head: true })
          .eq("status", "processing").lt("started_at", extractionCutoff),
      ),
      headCount(() =>
        supabase.from("reminder_schedules").select("id", { count: "exact", head: true })
          .eq("status", "failed").gte("last_attempt_at", failureCutoff),
      ),
      headCount(() =>
        supabase.from("automation_audit_logs").select("id", { count: "exact", head: true })
          .eq("status", "failed").gte("created_at", failureCutoff),
      ),
    ]);

    const jobHealth: JobHealth = { stuckReminders, stuckExtractions, reminderFailures24h, automationFailures24h };
    log.info("done", { ...jobHealth });
    return { ok: true, jobHealth };
  } catch (error) {
    log.error("query_failed", { error: error instanceof Error ? error.message : String(error) });
    return { ok: false, error: "Could not read job health.", configured: true };
  }
}
