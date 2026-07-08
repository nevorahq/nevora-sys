import { beforeEach, describe, expect, it, vi } from "vitest";

const getServiceRoleClient = vi.fn();

vi.mock("@/lib/supabase/service-role", () => ({ getServiceRoleClient }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

const { expireStalePlannerSuggestions } = await import("./expire-stale-planner-suggestions");

let updatePayloads: unknown[];
let insertPayloads: unknown[];
let rpcCalls: Array<{ fn: string; args: unknown }>;

type Resolver = (table: string, op: string) => unknown;
type RpcResolver = (fn: string) => unknown;

function makeSupabase(resolver: Resolver, rpcResolver: RpcResolver = () => ({ data: null, error: null })) {
  const from = vi.fn((table: string) => {
    const state = { op: "select" };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.update = vi.fn((payload: unknown) => {
      state.op = "update";
      updatePayloads.push(payload);
      return builder;
    });
    builder.insert = vi.fn((payload: unknown) => {
      state.op = "insert";
      insertPayloads.push(payload);
      return builder;
    });
    for (const m of ["eq", "lt", "in", "limit"]) builder[m] = vi.fn(() => builder);
    const term = () => Promise.resolve(resolver(table, state.op));
    (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      term().then(res, rej);
    return builder;
  });

  const rpc = vi.fn((fn: string, args: unknown) => {
    rpcCalls.push({ fn, args });
    return Promise.resolve(rpcResolver(fn));
  });

  return { from, rpc };
}

const staleRows = [
  { id: "s1", organization_id: "org-1", workspace_id: "ws-1", planner_entry_id: "e1", suggestion_type: "create_task" },
  { id: "s2", organization_id: "org-2", workspace_id: null, planner_entry_id: "e2", suggestion_type: "link_entities" },
];

/** Both RPCs succeed with nothing to do. */
const quietRpcs: RpcResolver = (fn) =>
  fn === "reconcile_stuck_planner_suggestions"
    ? { data: [{ released: 0, finalized: 0 }], error: null }
    : { data: 0, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  updatePayloads = [];
  insertPayloads = [];
  rpcCalls = [];
});

describe("expireStalePlannerSuggestions", () => {
  it("degrades safely when no service-role client is configured", async () => {
    getServiceRoleClient.mockReturnValue(null);
    const result = await expireStalePlannerSuggestions();
    expect(result).toEqual({
      ok: false,
      released: 0,
      finalized: 0,
      orphaned: 0,
      stale: 0,
      configured: false,
    });
  });

  it("reconciles crashed claims before expiring anything", async () => {
    getServiceRoleClient.mockReturnValue(
      makeSupabase(() => ({ data: [], error: null }), quietRpcs),
    );

    await expireStalePlannerSuggestions();

    // Order matters: released claims must be visible to the expiry passes.
    expect(rpcCalls.map((c) => c.fn)).toEqual([
      "reconcile_stuck_planner_suggestions",
      "expire_orphaned_planner_suggestions",
    ]);
    expect(rpcCalls[0].args).toMatchObject({ p_timeout_minutes: 15 });
  });

  it("reports released and finalized claims from the reconcile RPC", async () => {
    getServiceRoleClient.mockReturnValue(
      makeSupabase(
        () => ({ data: [], error: null }),
        (fn) =>
          fn === "reconcile_stuck_planner_suggestions"
            ? { data: [{ released: 2, finalized: 1 }], error: null }
            : { data: 3, error: null },
      ),
    );

    const result = await expireStalePlannerSuggestions();

    expect(result).toMatchObject({ ok: true, released: 2, finalized: 1, orphaned: 3, stale: 0 });
  });

  it("returns zero without writing when nothing is stale", async () => {
    getServiceRoleClient.mockReturnValue(
      makeSupabase(() => ({ data: [], error: null }), quietRpcs),
    );

    const result = await expireStalePlannerSuggestions();

    expect(result).toMatchObject({ ok: true, stale: 0, configured: true });
    expect(updatePayloads).toHaveLength(0);
  });

  it("expires stale suggestions and emits compact domain events", async () => {
    getServiceRoleClient.mockReturnValue(
      makeSupabase((table, op) => {
        if (table === "planner_suggestions" && op === "select") return { data: staleRows, error: null };
        return { data: null, error: null };
      }, quietRpcs),
    );

    const result = await expireStalePlannerSuggestions();

    expect(result).toMatchObject({ ok: true, stale: 2, configured: true });
    expect(updatePayloads[0]).toMatchObject({ status: "expired" });

    const events = insertPayloads[0] as Array<Record<string, unknown>>;
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      event_name: "planner_suggestion.expired",
      aggregate_type: "planner_suggestion",
      organization_id: "org-1",
      payload: { reason: "ttl", suggestion_type: "create_task" },
    });
    // The user's raw capture text never leaks into an event payload.
    expect(JSON.stringify(events)).not.toContain("raw_text");
  });

  it("keeps sweeping when the reconcile RPC fails", async () => {
    getServiceRoleClient.mockReturnValue(
      makeSupabase(() => ({ data: [], error: null }), (fn) =>
        fn === "reconcile_stuck_planner_suggestions"
          ? { data: null, error: { message: "boom" } }
          : { data: 4, error: null },
      ),
    );

    const result = await expireStalePlannerSuggestions();

    // A stuck claim is invisible to the user; expiry is still worth running.
    expect(result).toMatchObject({ ok: true, released: 0, finalized: 0, orphaned: 4 });
  });

  it("reports failure when the orphan RPC fails", async () => {
    getServiceRoleClient.mockReturnValue(
      makeSupabase(() => ({ data: [], error: null }), (fn) =>
        fn === "expire_orphaned_planner_suggestions"
          ? { data: null, error: { message: "boom" } }
          : { data: [{ released: 0, finalized: 0 }], error: null },
      ),
    );

    const result = await expireStalePlannerSuggestions();

    expect(result).toMatchObject({ ok: false, orphaned: 0 });
    expect(updatePayloads).toHaveLength(0);
  });

  it("reports failure when the stale update is rejected", async () => {
    getServiceRoleClient.mockReturnValue(
      makeSupabase((_table, op) => {
        if (op === "select") return { data: staleRows, error: null };
        if (op === "update") return { data: null, error: { message: "boom" } };
        return { data: null, error: null };
      }, quietRpcs),
    );

    const result = await expireStalePlannerSuggestions();

    expect(result).toMatchObject({ ok: false, stale: 0 });
  });
});
