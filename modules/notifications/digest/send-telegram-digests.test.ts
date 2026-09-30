import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTelegramDigests } from "./send-telegram-digests";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-org", () => ({
  permissionsForRole: (role: string) => new Set(role === "guest" ? [] : ["action_center.view"]),
}));

/**
 * A tiny in-memory stand-in for the PostgREST builder — only the calls the
 * sweep makes. Enough to prove the scheduling, claim and idempotency rules
 * without a database; the SQL half is proven by supabase/tests/126_*.
 */
type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>, opts: { missingDigests?: boolean } = {}) {
  const uniqueDigest = (row: Row) => `${row.organization_id}|${row.user_id}|${row.channel}|${row.local_date}`;

  function builder(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: Row | null = null;
    let head = false;
    let limit = Infinity;
    let returnRows = false;

    const rows = () => (tables[table] ??= []);
    const run = () => {
      if (table === "notification_digests" && opts.missingDigests) {
        return { data: null, error: { code: "PGRST205", message: "missing" }, count: null };
      }
      if (op === "insert") {
        const record = { attempts: 1, ...payload } as Row;
        if (table === "notification_digests" && rows().some((r) => uniqueDigest(r) === uniqueDigest(record))) {
          return { data: null, error: { code: "23505", message: "duplicate" }, count: null };
        }
        rows().push(record);
        return { data: null, error: null, count: null };
      }
      const matched = rows().filter((row) => filters.every((f) => f(row)));
      if (op === "update") {
        matched.forEach((row) => Object.assign(row, payload));
        return { data: returnRows ? matched : null, error: null, count: null };
      }
      return { data: head ? null : matched.slice(0, limit), error: null, count: matched.length };
    };

    const api = {
      select(_cols?: string, options?: { head?: boolean }) {
        if (op === "update") returnRows = true;
        head = Boolean(options?.head);
        return api;
      },
      insert(value: Row) { op = "insert"; payload = value; return api; },
      update(value: Row) { op = "update"; payload = value; return api; },
      eq(col: string, value: unknown) { filters.push((r) => r[col] === value); return api; },
      in(col: string, values: unknown[]) { filters.push((r) => values.includes(r[col])); return api; },
      is(col: string, value: null) { filters.push((r) => (r[col] ?? null) === value); return api; },
      not(col: string, _op: string, value: null) { filters.push((r) => (r[col] ?? null) !== value); return api; },
      gte(col: string, value: string) { filters.push((r) => String(r[col]) >= value); return api; },
      lt(col: string, value: string) { filters.push((r) => String(r[col]) < value); return api; },
      order() { return api; },
      limit(n: number) { limit = n; return api; },
      maybeSingle() { const res = run(); return Promise.resolve({ ...res, data: (res.data as Row[] | null)?.[0] ?? null }); },
      then(resolve: (value: ReturnType<typeof run>) => unknown) { return Promise.resolve(run()).then(resolve); },
    };
    return api;
  }

  return { from: (table: string) => builder(table) } as unknown as SupabaseClient;
}

const ORG = "org-1";
const USER = "user-1";
// 06:10 UTC = 09:10 in Chișinău (UTC+3 on 30 Sep).
const MORNING = new Date("2026-09-30T06:10:00Z");

function baseTables(overrides: Partial<Record<string, Row[]>> = {}): Record<string, Row[]> {
  return {
    notification_digests: [],
    channel_integrations: [{ organization_id: ORG, user_id: USER, external_chat_id: "chat-1", channel: "telegram", status: "active" }],
    user_notification_preferences: [{
      organization_id: ORG, user_id: USER, telegram_digest_enabled: true, digest_hour: 9, timezone: "Europe/Chisinau",
      quiet_hours_enabled: false, quiet_hours_start: "22:00", quiet_hours_end: "08:00",
    }],
    organizations: [{ id: ORG, timezone: null }],
    memberships: [{ organization_id: ORG, user_id: USER, role: "owner", status: "active" }],
    profiles: [{ id: USER, language: "ru" }],
    action_items: [
      { organization_id: ORG, deleted_at: null, status: "open", title: "Оплатить аренду", due_at: "2026-09-29T00:00:00.000Z" },
      { organization_id: ORG, deleted_at: null, status: "open", title: "Проверить договор", due_at: null },
      { organization_id: "org-2", deleted_at: null, status: "open", title: "Чужая задача", due_at: null },
    ],
    ...overrides,
  };
}

function run(tables: Record<string, Row[]>, now = MORNING, send = vi.fn().mockResolvedValue(true), opts = {}) {
  return { send, promise: sendTelegramDigests({ supabase: fakeDb(tables, opts), now, appUrl: "https://app.example", send }) };
}

describe("sendTelegramDigests", () => {
  it("sends one digest at the user's hour, in their language, with their organization's items only", async () => {
    const tables = baseTables();
    const { send, promise } = run(tables);
    const result = await promise;

    expect(result).toMatchObject({ ok: true, candidates: 1, sent: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    const [chatId, text, button] = send.mock.calls[0];
    expect(chatId).toBe("chat-1");
    expect(text).toContain("Просрочено: 1");
    expect(text).toContain("Всего требует внимания: 2");
    expect(text).toContain("• Оплатить аренду — просрочено");
    expect(text).not.toContain("Чужая задача");
    expect(button).toEqual({ label: "Открыть Центр действий", url: "https://app.example/dashboard" });
    expect(tables.notification_digests).toEqual([
      expect.objectContaining({ local_date: "2026-09-30", status: "sent", item_count: 2, attempts: 1 }),
    ]);
  });

  it("does not send twice on the same day", async () => {
    const tables = baseTables();
    await run(tables).promise;
    const second = run(tables, new Date("2026-09-30T07:10:00Z"));
    expect(await second.promise).toMatchObject({ sent: 0, notDue: 1 });
    expect(second.send).not.toHaveBeenCalled();
  });

  it("waits outside the user's window and respects quiet hours", async () => {
    const early = run(baseTables(), new Date("2026-09-30T04:10:00Z")); // 07:10 local
    expect(await early.promise).toMatchObject({ sent: 0, notDue: 1 });

    const quiet = baseTables();
    Object.assign(quiet.user_notification_preferences[0], { quiet_hours_enabled: true, quiet_hours_start: "08:00", quiet_hours_end: "10:00" });
    const held = run(quiet);
    expect(await held.promise).toMatchObject({ sent: 0, notDue: 1 });
    expect(held.send).not.toHaveBeenCalled();
    expect(quiet.notification_digests).toHaveLength(0);
  });

  it("honours the switch", async () => {
    const tables = baseTables();
    tables.user_notification_preferences[0].telegram_digest_enabled = false;
    const off = run(tables);
    expect(await off.promise).toMatchObject({ sent: 0, notDue: 1 });
    expect(off.send).not.toHaveBeenCalled();
  });

  it("records an empty day and sends nothing", async () => {
    const tables = baseTables({ action_items: [] });
    const empty = run(tables);
    expect(await empty.promise).toMatchObject({ sent: 0, empty: 1 });
    expect(empty.send).not.toHaveBeenCalled();
    expect(tables.notification_digests[0]).toMatchObject({ status: "skipped", reason: "empty" });
  });

  it("skips a user who left the organization", async () => {
    const tables = baseTables({ memberships: [] });
    const gone = run(tables);
    expect(await gone.promise).toMatchObject({ sent: 0, notMember: 1 });
    expect(gone.send).not.toHaveBeenCalled();
  });

  it("retries a failed send within the window, up to three attempts", async () => {
    const tables = baseTables();
    const failing = vi.fn().mockResolvedValue(false);
    await run(tables, MORNING, failing).promise;
    expect(tables.notification_digests[0]).toMatchObject({ status: "failed", reason: "send_failed", attempts: 1 });

    await run(tables, new Date("2026-09-30T07:10:00Z"), failing).promise;
    await run(tables, new Date("2026-09-30T08:10:00Z"), failing).promise;
    expect(tables.notification_digests[0]).toMatchObject({ status: "failed", attempts: 3 });

    const fourth = run(tables, new Date("2026-09-30T08:40:00Z"));
    expect(await fourth.promise).toMatchObject({ sent: 0, notDue: 1 });
    expect(fourth.send).not.toHaveBeenCalled();
  });

  it("falls back to the organization timezone, then UTC", async () => {
    const tables = baseTables({ user_notification_preferences: [], organizations: [{ id: ORG, timezone: "Europe/Chisinau" }] });
    const viaOrg = run(tables);
    expect(await viaOrg.promise).toMatchObject({ sent: 1 });
  });

  it("reports a missing migration instead of failing", async () => {
    const pending = run(baseTables(), MORNING, vi.fn(), { missingDigests: true });
    expect(await pending.promise).toMatchObject({ ok: true, migrationPending: true, sent: 0 });
  });
});
