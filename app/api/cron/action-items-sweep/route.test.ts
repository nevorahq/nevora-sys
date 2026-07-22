import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sprint 3 — unit 3.2: durable Action Center generation sweep.
 *
 * The behavioural half asserts the fail-closed CRON_SECRET contract (the sweep
 * itself is mocked — it is server-only and cross-org). The structural half pins
 * the properties that make the sweep safe: registered as a machine route,
 * scheduled by a Netlify function, writability-aware, and notification-free.
 */

const sweepMock = vi.fn();
vi.mock("@/modules/action-center/services/sweep-action-items", () => ({
  sweepActionItems: sweepMock,
}));

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

async function callRoute(authorization?: string) {
  const { GET } = await import("./route");
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return GET(new Request("https://x/api/cron/action-items-sweep", { headers }));
}

describe("cron/action-items-sweep: fail-closed auth", () => {
  const prev = process.env.CRON_SECRET;
  beforeEach(() => {
    vi.resetModules();
    sweepMock.mockReset();
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });

  it("503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await callRoute("Bearer whatever");
    expect(res.status).toBe(503);
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("401 on a missing/wrong secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await callRoute(undefined)).status).toBe(401);
    expect((await callRoute("Bearer nope")).status).toBe(401);
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("200 with the sweep result on a valid secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    sweepMock.mockResolvedValue({ ok: true, configured: true, orgsScanned: 2, orgsSkippedNotWritable: 1, itemsCreated: 5 });
    const res = await callRoute("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, itemsCreated: 5 });
    expect(sweepMock).toHaveBeenCalledOnce();
  });

  it("500 when the sweep reports failure", async () => {
    process.env.CRON_SECRET = "s3cret";
    sweepMock.mockResolvedValue({ ok: false, configured: true, orgsScanned: 0, orgsSkippedNotWritable: 0, itemsCreated: 0 });
    expect((await callRoute("Bearer s3cret")).status).toBe(500);
  });
});

describe("cron/action-items-sweep: structural guarantees", () => {
  it("is registered as a machine route (proxy bypass)", () => {
    expect(read("shared/config/routes.ts")).toContain('"/api/cron/action-items-sweep"');
  });

  it("is scheduled by a Netlify function that triggers the same basename", () => {
    const fn = read("netlify/functions/action-items-sweep.mts");
    expect(fn).toContain('triggerCron("action-items-sweep")');
    expect(fn).toMatch(/schedule:\s*["'][^"']+["']/);
  });

  it("the sweep is writability-aware and notification-free", () => {
    const sweep = read("modules/action-center/services/sweep-action-items.ts");
    expect(sweep).toContain("is_organization_writable");
    expect(sweep).toContain("deliverNotifications: false");
    expect(sweep).toContain("getServiceRoleClient");
  });
});
