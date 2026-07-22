import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase/service-role", () => ({ getServiceRoleClient: () => h.client }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { child: () => ({ info() {}, warn() {}, error() {} }) },
}));

interface QueryTrace {
  table: string;
  filters: Array<[method: "eq" | "lt" | "gte", column: string, value: unknown]>;
}

function makeClient(
  counts: Record<string, number | null>,
  failingKey?: string,
): { client: unknown; traces: QueryTrace[] } {
  const traces: QueryTrace[] = [];

  const client = {
    from(table: string) {
      const trace: QueryTrace = { table, filters: [] };
      traces.push(trace);
      let status = "";
      const builder = {
        select() { return builder; },
        eq(column: string, value: unknown) {
          trace.filters.push(["eq", column, value]);
          if (column === "status") status = String(value);
          return builder;
        },
        lt(column: string, value: unknown) {
          trace.filters.push(["lt", column, value]);
          return builder;
        },
        gte(column: string, value: unknown) {
          trace.filters.push(["gte", column, value]);
          return builder;
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          const key = `${table}:${status}`;
          return Promise.resolve({
            count: counts[key] ?? null,
            error: key === failingKey ? { message: "count failed" } : null,
          }).then(resolve, reject);
        },
      };
      return builder;
    },
  };

  return { client, traces };
}

async function run() {
  vi.resetModules();
  const { getJobHealth } = await import("./get-job-health");
  return getJobHealth();
}

describe("getJobHealth", () => {
  beforeEach(() => {
    h.client = null;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T12:00:00.000Z"));
  });

  afterEach(() => { vi.useRealTimers(); });

  it("fails closed when the service role is unavailable", async () => {
    await expect(run()).resolves.toEqual({
      ok: false,
      error: "Service role is not configured.",
      configured: false,
    });
  });

  it("returns all four aggregate counts and uses the reaper timestamp columns", async () => {
    const stub = makeClient({
      "reminder_schedules:processing": 2,
      "document_extractions:processing": 3,
      "reminder_schedules:failed": 4,
      "automation_audit_logs:failed": 5,
    });
    h.client = stub.client;

    await expect(run()).resolves.toEqual({
      ok: true,
      jobHealth: {
        stuckReminders: 2,
        stuckExtractions: 3,
        reminderFailures24h: 4,
        automationFailures24h: 5,
      },
    });

    const reminders = stub.traces.find(
      (trace) => trace.table === "reminder_schedules"
        && trace.filters.some(([, column, value]) => column === "status" && value === "processing"),
    );
    const extractions = stub.traces.find((trace) => trace.table === "document_extractions");
    const automationFailures = stub.traces.find((trace) => trace.table === "automation_audit_logs");
    expect(reminders?.filters).toContainEqual(["lt", "last_attempt_at", "2026-07-22T11:45:00.000Z"]);
    expect(extractions?.filters).toContainEqual(["lt", "started_at", "2026-07-22T11:50:00.000Z"]);
    expect(automationFailures?.filters).toContainEqual(["gte", "created_at", "2026-07-21T12:00:00.000Z"]);
  });

  it("fails closed when PostgREST omits an aggregate count", async () => {
    h.client = makeClient({}).client;
    await expect(run()).resolves.toEqual({
      ok: false,
      error: "Could not read job health.",
      configured: true,
    });
  });

  it("returns a configured failure when any aggregate query fails", async () => {
    h.client = makeClient({}, "document_extractions:processing").client;
    await expect(run()).resolves.toEqual({
      ok: false,
      error: "Could not read job health.",
      configured: true,
    });
  });
});
