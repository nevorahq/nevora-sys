import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sprint 5 — S5.2: usage-reconcile cron. Behavioural half asserts the fail-closed
 * CRON_SECRET contract (the sweep is mocked). Structural half pins the properties
 * that keep it safe: registered as a machine route, scheduled, and report-first.
 */

const sweepMock = vi.fn();
vi.mock("@/modules/billing/services/reconcile-usage-counters", () => ({
  reconcileUsageCounters: sweepMock,
}));

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

async function callRoute(authorization?: string) {
  const { GET } = await import("./route");
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return GET(new Request("https://x/api/cron/usage-reconcile", { headers }));
}

describe("cron/usage-reconcile: fail-closed auth", () => {
  const prev = process.env.CRON_SECRET;
  beforeEach(() => { vi.resetModules(); sweepMock.mockReset(); });
  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });

  it("503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    expect((await callRoute("Bearer x")).status).toBe(503);
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("401 on a missing/wrong secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await callRoute(undefined)).status).toBe(401);
    expect((await callRoute("Bearer nope")).status).toBe(401);
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("200 with the reconcile result on a valid secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    sweepMock.mockResolvedValue({ ok: true, configured: true, repairEnabled: false, orgsScanned: 3, discrepancies: 1, repaired: 0, alerts: 0 });
    const res = await callRoute("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, discrepancies: 1, repaired: 0 });
  });

  it("500 when the sweep reports failure", async () => {
    process.env.CRON_SECRET = "s3cret";
    sweepMock.mockResolvedValue({ ok: false, configured: true, repairEnabled: false, orgsScanned: 0, discrepancies: 0, repaired: 0, alerts: 0 });
    expect((await callRoute("Bearer s3cret")).status).toBe(500);
  });
});

describe("cron/usage-reconcile: structural guarantees", () => {
  it("is registered as a machine route (proxy bypass)", () => {
    expect(read("shared/config/routes.ts")).toContain('"/api/cron/usage-reconcile"');
  });

  it("is scheduled by a Netlify function that triggers the same basename", () => {
    const fn = read("netlify/functions/usage-reconcile.mts");
    expect(fn).toContain('triggerCron("usage-reconcile")');
  });

  it("the service is report-first (repair behind an env flag)", () => {
    const svc = read("modules/billing/services/reconcile-usage-counters.ts");
    expect(svc).toContain("USAGE_RECONCILE_REPAIR");
    expect(svc).toContain("getServiceRoleClient");
  });
});
