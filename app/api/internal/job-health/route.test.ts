import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sprint 5 — S5.3 follow-up: job-health diagnostic. Behavioural half asserts the
 * fail-closed METRICS_SECRET contract (the query is mocked). Structural half pins
 * the properties that keep it safe: registered as a machine route, aggregate-only,
 * and covering the stuck/failed sources.
 */

const queryMock = vi.fn();
vi.mock("@/modules/billing/queries/get-job-health", () => ({ getJobHealth: queryMock }));

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

async function callRoute(authorization?: string) {
  const { GET } = await import("./route");
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return GET(new Request("https://x/api/internal/job-health", { headers }));
}

describe("job-health: fail-closed auth", () => {
  const prev = process.env.METRICS_SECRET;
  beforeEach(() => { vi.resetModules(); queryMock.mockReset(); });
  afterEach(() => {
    if (prev === undefined) delete process.env.METRICS_SECRET;
    else process.env.METRICS_SECRET = prev;
  });

  it("503 without METRICS_SECRET", async () => {
    delete process.env.METRICS_SECRET;
    expect((await callRoute("Bearer x")).status).toBe(503);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("401 on a wrong secret", async () => {
    process.env.METRICS_SECRET = "s3cret";
    expect((await callRoute("Bearer nope")).status).toBe(401);
    expect((await callRoute("Basic s3cret")).status).toBe(401);
    expect((await callRoute("Bearer s3cret-extra")).status).toBe(401);
    expect((await callRoute(undefined)).status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("200 with the snapshot on a valid secret", async () => {
    process.env.METRICS_SECRET = "s3cret";
    queryMock.mockResolvedValue({ ok: true, jobHealth: { stuckReminders: 2, stuckExtractions: 0, reminderFailures24h: 1, automationFailures24h: 3 } });
    const res = await callRoute("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, jobHealth: { stuckReminders: 2, automationFailures24h: 3 } });
  });

  it("500 when the query fails (configured)", async () => {
    process.env.METRICS_SECRET = "s3cret";
    queryMock.mockResolvedValue({ ok: false, error: "boom", configured: true });
    expect((await callRoute("Bearer s3cret")).status).toBe(500);
  });

  it("503 when the service-role query is not configured", async () => {
    process.env.METRICS_SECRET = "s3cret";
    queryMock.mockResolvedValue({ ok: false, error: "missing service role", configured: false });
    expect((await callRoute("Bearer s3cret")).status).toBe(503);
  });

  it("500 when the query throws unexpectedly", async () => {
    process.env.METRICS_SECRET = "s3cret";
    queryMock.mockRejectedValue(new Error("database unavailable"));
    const response = await callRoute("Bearer s3cret");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Could not read job health." });
  });
});

describe("job-health: structural guarantees", () => {
  it("is registered as a machine route (proxy bypass)", () => {
    expect(read("shared/config/routes.ts")).toContain('"/api/internal/job-health"');
  });

  it("the query covers the stuck + failed sources, aggregate-only", () => {
    const q = read("modules/billing/queries/get-job-health.ts");
    expect(q).toContain("getServiceRoleClient");
    expect(q).toContain('"reminder_schedules"');
    expect(q).toContain('"document_extractions"');
    expect(q).toContain('"automation_audit_logs"');
    expect(q).toContain('"processing"');
    expect(q).toContain('"failed"');
    // aggregate-only: head counts, never a select of a payload/content column
    expect(q).toContain('count: "exact", head: true');
    expect(q).toContain('.lt("started_at", extractionCutoff)');
    expect(q).not.toMatch(/\.select\(\s*["'`][^"'`]*(payload|error_message)/);
  });
});
