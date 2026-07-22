import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sprint 5 — S5.2: usage-counter reconciliation behaviour. Verifies drift is
 * detected, that it is REPORT-FIRST (no write unless USAGE_RECONCILE_REPAIR is
 * set), and that a matching counter is a no-op (idempotent).
 */

const h = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase/service-role", () => ({ getServiceRoleClient: () => h.client }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { child: () => ({ info() {}, warn() {}, error() {} }) },
}));

interface StubConfig {
  orgs: { id: string }[];
  counterRows: { key: string; value: number }[];
  counts: Record<string, number>;
  repairs: string[];
}

/** Minimal Supabase stub: resolves org list, counter rows, head-counts, updates. */
function makeClient(cfg: StubConfig) {
  function builder(table: string) {
    let isCount = false;
    let isUpdate = false;
    const b = {
      select(_cols: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.count) isCount = true;
        return b;
      },
      update() { isUpdate = true; return b; },
      eq() { return b; },
      is() { return b; },
      in() { return b; },
      limit() { return b; },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        let payload: unknown;
        if (isUpdate) { cfg.repairs.push(table); payload = { error: null }; }
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
