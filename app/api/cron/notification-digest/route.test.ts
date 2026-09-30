import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ADR 003 step 1: notification-digest cron. Behavioural half asserts the
 * fail-closed CRON_SECRET contract (the sweep is mocked); structural half pins
 * that it is a machine route and scheduled hourly.
 */

const sweepMock = vi.fn();
vi.mock("@/modules/notifications/digest/send-telegram-digests", () => ({ sendTelegramDigests: sweepMock }));
vi.mock("@/lib/supabase/service-role", () => ({ getServiceRoleClient: () => ({}) }));

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

async function callRoute(authorization?: string) {
  const { GET } = await import("./route");
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return GET(new Request("https://x/api/cron/notification-digest", { headers }));
}

describe("cron/notification-digest: fail-closed auth", () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    sweepMock.mockReset();
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_WEBHOOK_SECRET = "hook";
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    expect((await callRoute("Bearer x")).status).toBe(503);
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("401 on a missing or wrong secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await callRoute(undefined)).status).toBe(401);
    expect((await callRoute("Bearer nope")).status).toBe(401);
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("skips without error when Telegram is not configured", async () => {
    process.env.CRON_SECRET = "s3cret";
    delete process.env.TELEGRAM_BOT_TOKEN;
    const res = await callRoute("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ skipped: "telegram_unconfigured" });
    expect(sweepMock).not.toHaveBeenCalled();
  });

  it("returns the sweep result on a valid secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    sweepMock.mockResolvedValue({ ok: true, candidates: 2, sent: 1, failed: 0, empty: 1, notDue: 0, notMember: 0 });
    const res = await callRoute("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 1, empty: 1 });
  });

  it("500 when the sweep reports failure", async () => {
    process.env.CRON_SECRET = "s3cret";
    sweepMock.mockResolvedValue({ ok: false, candidates: 0, sent: 0, failed: 0, empty: 0, notDue: 0, notMember: 0 });
    expect((await callRoute("Bearer s3cret")).status).toBe(500);
  });
});

describe("cron/notification-digest: wiring", () => {
  it("is a machine route, so the proxy does not redirect it to /login", () => {
    expect(read("shared/config/routes.ts")).toContain('"/api/cron/notification-digest"');
  });

  it("runs every hour, so each user's digest can go out at their own hour", () => {
    const fn = read("netlify/functions/notification-digest.mts");
    expect(fn).toContain('triggerCron("notification-digest")');
    expect(fn).toMatch(/schedule:\s*"5 \* \* \* \*"/);
  });
});
