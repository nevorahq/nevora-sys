import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT_DIR = process.cwd();

/**
 * Sprint 5 — S5.2: usage-counter reconciliation behaviour. Verifies drift is
 * detected, that it is REPORT-FIRST (no write unless USAGE_RECONCILE_REPAIR is
 * set), and that a matching counter is a no-op (idempotent).
 */

const h = vi.hoisted(() => ({ client: null as unknown }));

const mon = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@/lib/observability/monitoring", () => ({ getMonitoring: () => mon }));
vi.mock("@/lib/supabase/service-role", () => ({ getServiceRoleClient: () => h.client }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { child: () => ({ info() {}, warn() {}, error() {} }) },
}));

interface StubConfig {
  orgs: { id: string }[];
  counterRows: { key: string; value: number }[];
  counts: Record<string, number>;
  repairs: string[];
  /** Rows inserted into the discrepancy audit table (captured for assertions). */
  audited?: unknown[];
  /** Simulate the audit table being unavailable (e.g. migration 112 not applied). */
  auditError?: string;
}

/** Minimal Supabase stub: resolves org list, counter rows, head-counts, updates. */
function makeClient(cfg: StubConfig) {
  function builder(table: string) {
    let isCount = false;
    let isUpdate = false;
    let isInsert = false;
    const b = {
      select(_cols: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.count) isCount = true;
        return b;
      },
      update() { isUpdate = true; return b; },
      insert(rows: unknown) { isInsert = true; (cfg.audited ??= []).push(...(rows as unknown[])); return b; },
      eq() { return b; },
      is() { return b; },
      in() { return b; },
      limit() { return b; },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        let payload: unknown;
        if (isInsert) payload = { error: cfg.auditError ? { message: cfg.auditError } : null };
        else if (isUpdate) { cfg.repairs.push(table); payload = { error: null }; }
        else if (table === "organizations") payload = { data: cfg.orgs, error: null };
        else if (table === "organization_usage_counters" && !isCount) payload = { data: cfg.counterRows, error: null };
        else if (isCount) payload = { count: cfg.counts[table] ?? 0, error: null };
        else payload = { data: [], error: null };
        return Promise.resolve(payload).then(resolve, reject);
      },
    };
    return b;
  }
  return { from: (t: string) => builder(t) };
}

const NO_COUNTS = {
  todos: 0, documents: 0, money_transactions: 0, subscriptions: 0,
  developer_api_keys: 0, developer_webhooks: 0, memberships: 0,
};

async function run() {
  vi.resetModules();
  const mod = await import("./reconcile-usage-counters");
  return mod.reconcileUsageCounters();
}

describe("reconcileUsageCounters", () => {
  const prev = process.env.USAGE_RECONCILE_REPAIR;
  beforeEach(() => { delete process.env.USAGE_RECONCILE_REPAIR; });
  afterEach(() => {
    if (prev === undefined) delete process.env.USAGE_RECONCILE_REPAIR;
    else process.env.USAGE_RECONCILE_REPAIR = prev;
  });

  it("detects drift and is report-first (no repair without the flag)", async () => {
    const cfg: StubConfig = {
      orgs: [{ id: "org-1" }],
      counterRows: [{ key: "tasks.count", value: 5 }], // cached 5
      counts: { ...NO_COUNTS, todos: 3 }, // authoritative 3 → drift +2
      repairs: [],
    };
    h.client = makeClient(cfg);

    const result = await run();

    expect(result.ok).toBe(true);
    expect(result.discrepancies).toBe(1);
    expect(result.repaired).toBe(0); // report-first
    expect(cfg.repairs).toEqual([]); // nothing written
  });

  it("repairs the counter to the authoritative value when the flag is set", async () => {
    process.env.USAGE_RECONCILE_REPAIR = "true";
    const cfg: StubConfig = {
      orgs: [{ id: "org-1" }],
      counterRows: [{ key: "tasks.count", value: 5 }],
      counts: { ...NO_COUNTS, todos: 3 },
      repairs: [],
    };
    h.client = makeClient(cfg);

    const result = await run();

    expect(result.repairEnabled).toBe(true);
    expect(result.discrepancies).toBe(1);
    expect(result.repaired).toBe(1);
    expect(cfg.repairs).toContain("organization_usage_counters");
  });

  it("persists each discrepancy to the audit table", async () => {
    const cfg: StubConfig = {
      orgs: [{ id: "org-1" }],
      counterRows: [{ key: "tasks.count", value: 5 }],
      counts: { ...NO_COUNTS, todos: 3 },
      repairs: [],
    };
    h.client = makeClient(cfg);

    const result = await run();

    expect(result.persisted).toBe(1);
    expect(cfg.audited).toEqual([
      expect.objectContaining({
        organization_id: "org-1",
        counter_key: "tasks.count",
        counter_value: 5,
        authoritative_value: 3,
        delta: 2,
        repaired: false,
      }),
    ]);
  });

  it("is best-effort: an unavailable audit table does not fail the sweep", async () => {
    const cfg: StubConfig = {
      orgs: [{ id: "org-1" }],
      counterRows: [{ key: "tasks.count", value: 5 }],
      counts: { ...NO_COUNTS, todos: 3 },
      repairs: [],
      auditError: "relation \"usage_reconciliation_discrepancies\" does not exist",
    };
    h.client = makeClient(cfg);

    const result = await run();

    expect(result.ok).toBe(true);
    expect(result.discrepancies).toBe(1);
    expect(result.persisted).toBe(0); // table unavailable → not persisted, but sweep succeeds
  });

  it("escalates above-threshold drift to the monitoring seam", async () => {
    mon.captureMessage.mockClear();
    const cfg: StubConfig = {
      orgs: [{ id: "org-1" }],
      counterRows: [{ key: "tasks.count", value: 15 }], // cached 15
      counts: { ...NO_COUNTS, todos: 3 }, // authoritative 3 → drift 12 ≥ threshold 10
      repairs: [],
    };
    h.client = makeClient(cfg);

    const result = await run();

    expect(result.alerts).toBe(1);
    expect(mon.captureMessage).toHaveBeenCalledOnce();
    expect(mon.captureMessage).toHaveBeenCalledWith(
      expect.stringMatching(/drift/i),
      "warning",
      expect.objectContaining({ event: "billing.usage.drift" }),
    );
  });

  it("does NOT escalate a below-threshold drift", async () => {
    mon.captureMessage.mockClear();
    const cfg: StubConfig = {
      orgs: [{ id: "org-1" }],
      counterRows: [{ key: "tasks.count", value: 5 }],
      counts: { ...NO_COUNTS, todos: 3 }, // drift 2 < threshold
      repairs: [],
    };
    h.client = makeClient(cfg);
    const result = await run();
    expect(result.alerts).toBe(0);
    expect(mon.captureMessage).not.toHaveBeenCalled();
  });

  it("is a no-op when the counter already matches (idempotent)", async () => {
    const cfg: StubConfig = {
      orgs: [{ id: "org-1" }],
      counterRows: [{ key: "tasks.count", value: 3 }],
      counts: { ...NO_COUNTS, todos: 3 },
      repairs: [],
    };
    h.client = makeClient(cfg);

    const result = await run();

    expect(result.discrepancies).toBe(0);
    expect(result.repaired).toBe(0);
  });

  it("skips cleanly when the service role is unavailable", async () => {
    h.client = null;
    const result = await run();
    expect(result.ok).toBe(false);
    expect(result.configured).toBe(false);
  });
});

/**
 * Reconciliation covers exactly the CACHED counters. `ai_calls` and `storage_mb`
 * are computed live (no cache in `organization_usage_counters`), so they cannot
 * drift and must NOT be reconciled — a guard so a future change that starts
 * caching them also adds them here deliberately.
 */
describe("reconcile scope: cached lifetime counters only", () => {
  const src = readFileSync(join(ROOT_DIR, "modules/billing/services/reconcile-usage-counters.ts"), "utf8");

  it("reconciles the seven cached lifetime counter keys", () => {
    for (const key of [
      "tasks.count", "documents.count", "money_transactions.count", "subscriptions.count",
      "developer_api_keys.count", "developer_webhooks.count", "members.count",
    ]) {
      expect(src, `reconcile omits cached counter "${key}"`).toContain(key);
    }
  });

  it("does NOT reconcile the live-computed metrics", () => {
    // ai_calls / storage_mb are not cached — see reserve_organization_usage (072)
    // and the live-count triggers (033). They appear only in the explanatory note.
    const reconciledBlock = src.slice(src.indexOf("const RECONCILED"), src.indexOf("const REPAIR_ENABLED"));
    expect(reconciledBlock).not.toMatch(/["'`]ai_calls["'`]/);
    expect(reconciledBlock).not.toMatch(/["'`]storage_mb["'`]/);
  });
});
