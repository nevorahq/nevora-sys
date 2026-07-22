import "server-only";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";
import { generateActionItemsForOrg } from "./action-item-generator";

/**
 * Durable Action Center generation sweep (Sprint 3 — unit 3.2, GAP-A).
 *
 * The generator historically ran only when someone OPENED the Action Center /
 * Inbox feed. That means an org whose members never open the feed never gets its
 * attention items materialized — the signal is silently missed. This sweep runs
 * generation on a schedule so action items exist independently of a page view.
 *
 * Cross-org, so it uses the service-role client — the same established exception
 * as the extraction / suggestions / subscription sweeps. It is:
 *   - idempotent: one active item per (org, type, source_type, source_id) via
 *     `action_items_dedupe_idx`, so re-running never duplicates;
 *   - writability-aware: it skips orgs that are not writable
 *     (`is_organization_writable`), matching the interactive path — which is
 *     RLS-gated — so an expired-trial org gets no attention it cannot act on;
 *   - money-free and notification-free: it only ensures items EXIST. Durable
 *     milestone delivery (the reminders cron) owns per-user notifications for
 *     obligations, so the sweep passes `deliverNotifications: false`.
 */

const ORG_BATCH_LIMIT = 500;

export interface ActionItemsSweepResult {
  ok: boolean;
  configured: boolean;
  orgsScanned: number;
  orgsSkippedNotWritable: number;
  itemsCreated: number;
}

export async function sweepActionItems(): Promise<ActionItemsSweepResult> {
  const log = logger.child({ scope: "action_items_sweep" });
  const supabase = getServiceRoleClient();
  if (!supabase) {
    log.warn("skipped.no_service_role");
    return { ok: false, configured: false, orgsScanned: 0, orgsSkippedNotWritable: 0, itemsCreated: 0 };
  }

  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id")
    .limit(ORG_BATCH_LIMIT);

  if (error) {
    log.error("orgs_select_failed", { error: error.message });
    return { ok: false, configured: true, orgsScanned: 0, orgsSkippedNotWritable: 0, itemsCreated: 0 };
  }

  let orgsScanned = 0;
  let orgsSkippedNotWritable = 0;
  let itemsCreated = 0;

  for (const org of (orgs ?? []) as { id: string }[]) {
    const orgId = org.id;

    // Match the interactive path (RLS-gated on is_organization_writable): never
    // generate attention for an org that cannot act on it.
    const { data: writable } = await supabase.rpc("is_organization_writable", {
      p_organization_id: orgId,
    });
    if (!writable) {
      orgsSkippedNotWritable++;
      continue;
    }

    try {
      const { created } = await generateActionItemsForOrg(supabase, {
        orgId,
        workspaceId: null,
        actorUserId: null,
        deliverNotifications: false,
      });
      itemsCreated += created;
      orgsScanned++;
    } catch (e) {
      // One org's failure must never abort the whole sweep.
      log.error("org_generate_failed", {
        orgId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const result: ActionItemsSweepResult = {
    ok: true,
    configured: true,
    orgsScanned,
    orgsSkippedNotWritable,
    itemsCreated,
  };
  log.info("done", { ...result });
  return result;
}
