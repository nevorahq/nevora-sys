import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";

/**
 * Usage-counter reconciliation sweep (Sprint 5 — S5.2).
 *
 * `organization_usage_counters` is a CACHE of a live `COUNT(*)`, maintained by
 * triggers (migrations 072/076/081). Triggers can drift (a crash between a row
 * write and the counter update, a historical backfill gap). Drift silently
 * over- or under-charges a plan limit, so it must be detected and repaired.
 *
 * This is **report-first**: it always computes the authoritative count, compares
 * it to the cached counter, logs every discrepancy and alerts above a threshold.
 * It only WRITES the counter back when `USAGE_RECONCILE_REPAIR` is enabled — so a
 * money-adjacent cache is never rewritten silently. The repair is idempotent:
 * once a counter equals its authoritative value, the next run finds no drift.
 *
 * Cross-org, so it uses the service-role client (the established sweep exception).
 * Payments/tasks are usage-exempt by design (see usage-counter-drift runbook) —
 * this only reconciles the lifetime product counters below.
 */

const ORG_BATCH_LIMIT = 500;
/** A single-key drift at or above this magnitude escalates to an error alert. */
const ALERT_THRESHOLD = 10;

/** Lifetime counter keys → their authoritative live count. Definitions mirror the
 *  072 seed / 081 release trigger exactly, so recompute == what the trigger meant. */
const RECONCILED: Record<string, (q: CountQuery) => CountQuery> = {
  "tasks.count": (q) => q.from("todos").is("deleted_at", null),
  "documents.count": (q) => q.from("documents").is("deleted_at", null),
  "money_transactions.count": (q) => q.from("money_transactions").is("deleted_at", null),
  "subscriptions.count": (q) => q.from("subscriptions"),
  "developer_api_keys.count": (q) => q.from("developer_api_keys").is("revoked_at", null),
  "developer_webhooks.count": (q) => q.from("developer_webhooks").eq("is_active", true),
  "members.count": (q) => q.from("memberships").in("status", ["active", "invited"]),
};

const REPAIR_ENABLED =
  process.env.USAGE_RECONCILE_REPAIR === "true" || process.env.USAGE_RECONCILE_REPAIR === "1";

export interface UsageDiscrepancy {
  organizationId: string;
  key: string;
  counter: number;
  authoritative: number;
  delta: number;
}

export interface UsageReconcileResult {
  ok: boolean;
  configured: boolean;
  repairEnabled: boolean;
  orgsScanned: number;
  discrepancies: number;
  repaired: number;
  alerts: number;
}

/** Thin builder wrapper so RECONCILED can describe a count query declaratively. */
interface CountQuery {
  from(table: string): CountQuery;
  is(col: string, val: null): CountQuery;
  eq(col: string, val: unknown): CountQuery;
  in(col: string, vals: unknown[]): CountQuery;
}

async function authoritativeCount(
  supabase: SupabaseClient,
  orgId: string,
  key: string,
): Promise<number | null> {
  const spec = RECONCILED[key];
  if (!spec) return null;
  // Resolve the declarative spec into a real filtered head-count query.
  let table = "";
  const filters: { kind: "is" | "eq" | "in"; col: string; val: unknown }[] = [];
  const recorder: CountQuery = {
    from(t) { table = t; return recorder; },
    is(col) { filters.push({ kind: "is", col, val: null }); return recorder; },
    eq(col, val) { filters.push({ kind: "eq", col, val }); return recorder; },
    in(col, val) { filters.push({ kind: "in", col, val }); return recorder; },
  };
  spec(recorder);

  let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  for (const f of filters) {
    if (f.kind === "is") query = query.is(f.col, null);
    else if (f.kind === "eq") query = query.eq(f.col, f.val);
    else query = query.in(f.col, f.val as unknown[]);
  }
  const { count, error } = await query;
  if (error) return null;
  return count ?? 0;
}

export async function reconcileUsageCounters(): Promise<UsageReconcileResult> {
  const log = logger.child({ scope: "usage_reconcile" });
  const supabase = getServiceRoleClient();
  if (!supabase) {
    log.warn("skipped.no_service_role");
    return { ok: false, configured: false, repairEnabled: REPAIR_ENABLED, orgsScanned: 0, discrepancies: 0, repaired: 0, alerts: 0 };
  }

  const { data: orgs, error } = await supabase.from("organizations").select("id").limit(ORG_BATCH_LIMIT);
  if (error) {
    log.error("orgs_select_failed", { error: error.message });
    return { ok: false, configured: true, repairEnabled: REPAIR_ENABLED, orgsScanned: 0, discrepancies: 0, repaired: 0, alerts: 0 };
  }

  let orgsScanned = 0;
  let discrepancies = 0;
  let repaired = 0;
  let alerts = 0;

  for (const org of (orgs ?? []) as { id: string }[]) {
    const orgId = org.id;
    orgsScanned++;

    // Lifetime counter rows for this org (period_end IS NULL = the running total).
    const { data: rows } = await supabase
      .from("organization_usage_counters")
      .select("key, value")
      .eq("organization_id", orgId)
      .is("period_end", null)
      .in("key", Object.keys(RECONCILED));
    const cached = new Map((rows ?? []).map((r) => [r.key as string, Number(r.value) || 0]));

    for (const key of Object.keys(RECONCILED)) {
      const authoritative = await authoritativeCount(supabase, orgId, key);
      if (authoritative === null) continue;
      const counter = cached.get(key) ?? 0;
      if (counter === authoritative) continue;

      const delta = counter - authoritative;
      discrepancies++;
      const detail: UsageDiscrepancy = { organizationId: orgId, key, counter, authoritative, delta };

      if (Math.abs(delta) >= ALERT_THRESHOLD) {
        alerts++;
        log.error("discrepancy.alert", { ...detail });
      } else {
        log.warn("discrepancy", { ...detail });
      }

      if (REPAIR_ENABLED) {
        const { error: repairError } = await supabase
          .from("organization_usage_counters")
          .update({ value: authoritative, updated_at: new Date().toISOString() })
          .eq("organization_id", orgId)
          .eq("key", key)
          .is("period_end", null);
        if (!repairError) repaired++;
        else log.error("repair_failed", { ...detail, error: repairError.message });
      }
    }
  }

  const result: UsageReconcileResult = {
    ok: true,
    configured: true,
    repairEnabled: REPAIR_ENABLED,
    orgsScanned,
    discrepancies,
    repaired,
    alerts,
  };
  log.info("done", { ...result });
  return result;
}
