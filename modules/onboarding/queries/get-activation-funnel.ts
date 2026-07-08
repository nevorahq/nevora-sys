import "server-only";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";
import {
  computeActivationFunnel,
  type ActivationFunnel,
  type DraftDecisions,
  type FunnelRow,
  type SelectionSources,
} from "../services/activation-metrics";

/**
 * The Phase B / B7 activation funnel, across every organization.
 *
 * Cross-org by nature — an activation rate for a single tenant is a sample of one
 * — so it uses the service-role client, the same established exception as the
 * daily sweeps. It is reachable only from `/api/internal/activation-funnel`,
 * behind a shared secret, and it returns **aggregates only**: no user ids, no org
 * ids, no titles, nothing that identifies a person or a customer.
 */

export const DEFAULT_WINDOW_DAYS = 30;

/** Cohorts are small (one row per user per org); this is a runaway guard, not a page size. */
const MAX_ROWS = 10_000;

export type ActivationFunnelResult =
  | { ok: true; windowDays: number; funnel: ActivationFunnel }
  | { ok: false; error: string; configured: boolean };

export async function getActivationFunnel(windowDays = DEFAULT_WINDOW_DAYS): Promise<ActivationFunnelResult> {
  const log = logger.child({ scope: "activation_funnel" });
  const supabase = getServiceRoleClient();
  if (!supabase) {
    log.warn("skipped.no_service_role");
    return { ok: false, error: "Service role is not configured.", configured: false };
  }

  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: progressRows, error: progressError } = await supabase
    .from("onboarding_progress")
    .select(
      "organization_id, user_id, started_at, selected_at, selected_first_action, first_action_completed_at, first_workflow_completed_at, dismissed_at",
    )
    .gte("started_at", cutoff)
    .limit(MAX_ROWS);

  if (progressError) {
    log.error("progress_select_failed", { error: progressError.message });
    return { ok: false, error: "Could not read the funnel.", configured: true };
  }

  const rows = progressRows ?? [];

  // Action Center last-seen, keyed the same way onboarding_progress is. Fetched
  // for the cohort only; a user who never opened it simply has no row.
  const seenByUser = await loadLastSeen(supabase, rows);

  const [drafts, sources] = await Promise.all([
    loadDraftDecisions(supabase, cutoff),
    loadSelectionSources(supabase, cutoff),
  ]);

  const funnelRows: FunnelRow[] = rows.map((r) => ({
    started_at: r.started_at as string,
    selected_at: (r.selected_at as string | null) ?? null,
    selected_first_action: (r.selected_first_action as FunnelRow["selected_first_action"]) ?? null,
    first_action_completed_at: (r.first_action_completed_at as string | null) ?? null,
    first_workflow_completed_at: (r.first_workflow_completed_at as string | null) ?? null,
    dismissed_at: (r.dismissed_at as string | null) ?? null,
    action_center_last_seen_at: seenByUser.get(seenKey(r.organization_id as string, r.user_id as string)) ?? null,
  }));

  log.info("done", { windowDays, cohort: funnelRows.length });
  return { ok: true, windowDays, funnel: computeActivationFunnel(funnelRows, drafts, sources) };
}

function seenKey(organizationId: string, userId: string): string {
  return `${organizationId}:${userId}`;
}

type ServiceClient = NonNullable<ReturnType<typeof getServiceRoleClient>>;

async function loadLastSeen(
  supabase: ServiceClient,
  rows: Array<Record<string, unknown>>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (rows.length === 0) return map;

  const userIds = [...new Set(rows.map((r) => r.user_id as string))];
  const { data, error } = await supabase
    .from("action_center_seen")
    .select("organization_id, user_id, last_seen_at")
    .in("user_id", userIds)
    .limit(MAX_ROWS);

  if (error) {
    // A missing last-seen only sinks the "returned later" rate; the rest of the
    // funnel is still worth reporting.
    logger.child({ scope: "activation_funnel" }).warn("seen_select_failed", { error: error.message });
    return map;
  }

  for (const row of data ?? []) {
    map.set(seenKey(row.organization_id as string, row.user_id as string), row.last_seen_at as string);
  }
  return map;
}

/** Terminal states of every draft created in the window. */
async function loadDraftDecisions(supabase: ServiceClient, cutoff: string): Promise<DraftDecisions> {
  const statuses = ["accepted", "rejected", "expired", "pending"] as const;

  const counts = await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await supabase
        .from("planner_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("status", status)
        .gte("created_at", cutoff);
      if (error) {
        logger.child({ scope: "activation_funnel" }).warn("draft_count_failed", { status, error: error.message });
      }
      return count ?? 0;
    }),
  );

  return { accepted: counts[0], rejected: counts[1], expired: counts[2], pending: counts[3] };
}

/**
 * Which surface produced each first-action click. `source` was added to the event
 * payload in B7; events emitted before that carry none and count as 'wizard',
 * which is where every click came from at the time.
 */
async function loadSelectionSources(supabase: ServiceClient, cutoff: string): Promise<SelectionSources> {
  const { data, error } = await supabase
    .from("domain_events")
    .select("payload")
    .eq("event_name", "onboarding.first_action_selected")
    .gte("created_at", cutoff)
    .limit(MAX_ROWS);

  if (error) {
    logger.child({ scope: "activation_funnel" }).warn("sources_select_failed", { error: error.message });
    return { wizard: 0, empty_state: 0 };
  }

  const sources: SelectionSources = { wizard: 0, empty_state: 0 };
  for (const row of data ?? []) {
    const payload = row.payload as { source?: unknown } | null;
    if (payload?.source === "empty_state") sources.empty_state += 1;
    else sources.wizard += 1;
  }
  return sources;
}
