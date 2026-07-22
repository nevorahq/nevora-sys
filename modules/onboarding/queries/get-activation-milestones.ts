import "server-only";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";
import {
  computeActivationMilestones,
  MILESTONE_EVENT_NAMES,
  type ActivationMilestones,
  type MilestoneEvent,
} from "../services/activation-milestones";

/**
 * The full-product activation milestones, across every organization, computed
 * from `domain_events`. Cross-org, so it uses the service role and is only
 * reachable from `/api/internal/activation-funnel` (METRICS_SECRET-gated). The
 * result is aggregate-only — distinct-org reach counts, no ids, no content.
 */

const DEFAULT_WINDOW_DAYS = 30;
const MAX_ROWS = 50_000;
/** Supabase/PostgREST caps one response at 1,000 rows (supabase/config.toml). */
const PAGE_SIZE = 1_000;

export type ActivationMilestonesResult =
  | { ok: true; windowDays: number; milestones: ActivationMilestones; capped: boolean }
  | { ok: false; error: string; configured: boolean };

export async function getActivationMilestones(
  windowDays = DEFAULT_WINDOW_DAYS,
): Promise<ActivationMilestonesResult> {
  const log = logger.child({ scope: "activation_milestones" });
  const supabase = getServiceRoleClient();
  if (!supabase) {
    log.warn("skipped.no_service_role");
    return { ok: false, error: "Service role is not configured.", configured: false };
  }

  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const events: MilestoneEvent[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("domain_events")
      .select("organization_id, event_name, aggregate_id")
      .in("event_name", MILESTONE_EVENT_NAMES)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      log.error("events_select_failed", { error: error.message, offset });
      return { ok: false, error: "Could not read milestones.", configured: true };
    }
    const page = (data ?? []) as MilestoneEvent[];
    events.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const milestones = computeActivationMilestones(events);
  const capped = events.length === MAX_ROWS;
  log.info("done", { windowDays, events: events.length, capped });
  return { ok: true, windowDays, milestones, capped };
}
