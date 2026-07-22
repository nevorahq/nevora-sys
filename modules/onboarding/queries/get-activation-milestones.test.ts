import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase/service-role", () => ({ getServiceRoleClient: () => h.client }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { child: () => ({ info() {}, warn() {}, error() {} }) },
}));

interface PageResult {
  data: Array<{ organization_id: string; event_name: string; aggregate_id: string }> | null;
  error: { message: string } | null;
}

function makeClient(pageForOffset: (offset: number) => PageResult) {
  const ranges: Array<[number, number]> = [];
  const client = {
    from() {
      const builder = {
        select() { return builder; },
        in() { return builder; },
        gte() { return builder; },
        order() { return builder; },
        range(from: number, to: number) {
          ranges.push([from, to]);
          return Promise.resolve(pageForOffset(from));
        },
      };
      return builder;
    },
  };
  return { client, ranges };
}

async function run() {
  vi.resetModules();
  const { getActivationMilestones } = await import("./get-activation-milestones");
  return getActivationMilestones();
}

describe("getActivationMilestones pagination", () => {
  beforeEach(() => { h.client = null; });

  it("fails closed when the service role is unavailable", async () => {
    await expect(run()).resolves.toMatchObject({ ok: false, configured: false });
  });

  it("pages past the PostgREST 1,000-row cap", async () => {
    const row = { organization_id: "org-1", event_name: "planner_entry.created", aggregate_id: "entry-1" };
    const stub = makeClient((offset) => ({
      data: offset === 0 ? Array.from({ length: 1_000 }, () => row) : [row],
      error: null,
    }));
    h.client = stub.client;

    const result = await run();

    expect(result).toMatchObject({ ok: true, milestones: { reach: { first_capture: 1 } } });
    expect(stub.ranges).toEqual([[0, 999], [1_000, 1_999]]);
  });

  it("returns a configured failure when a later page fails", async () => {
    const row = { organization_id: "org-1", event_name: "planner_entry.created", aggregate_id: "entry-1" };
    h.client = makeClient((offset) => offset === 0
      ? { data: Array.from({ length: 1_000 }, () => row), error: null }
      : { data: null, error: { message: "page failed" } }).client;

    await expect(run()).resolves.toEqual({
      ok: false,
      error: "Could not read milestones.",
      configured: true,
    });
  });
});
