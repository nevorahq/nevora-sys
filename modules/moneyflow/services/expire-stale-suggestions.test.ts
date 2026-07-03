import { beforeEach, describe, expect, it, vi } from "vitest";

const getServiceRoleClient = vi.fn();

vi.mock("@/lib/supabase/service-role", () => ({ getServiceRoleClient }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

const { expireStaleSuggestions } = await import("./expire-stale-suggestions");

let updatePayloads: unknown[];
let insertPayloads: unknown[];

function makeSupabase(resolver: (table: string, op: string) => unknown) {
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
  return { from };
}

const staleRows = [
  { id: "s1", organization_id: "org-1", workspace_id: "ws-1", transaction_id: "t1", source: "ai" },
  { id: "s2", organization_id: "org-2", workspace_id: null, transaction_id: "t2", source: "system" },
];

beforeEach(() => {
  vi.clearAllMocks();
  updatePayloads = [];
  insertPayloads = [];
});

describe("expireStaleSuggestions", () => {
  it("degrades safely when no service-role client is configured", async () => {
    getServiceRoleClient.mockReturnValue(null);
    const result = await expireStaleSuggestions();
    expect(result).toEqual({ ok: false, expired: 0, configured: false });
  });

  it("returns zero without writing when nothing is stale", async () => {
    getServiceRoleClient.mockReturnValue(
      makeSupabase(() => ({ data: [], error: null })),
    );
    const result = await expireStaleSuggestions();
    expect(result).toEqual({ ok: true, expired: 0, configured: true });
    expect(updatePayloads).toHaveLength(0);
  });

  it("expires stale pending suggestions and emits compact domain events", async () => {
    getServiceRoleClient.mockReturnValue(
      makeSupabase((table, op) => {
        if (table === "money_ai_suggestions" && op === "select") return { data: staleRows, error: null };
        return { data: null, error: null };
      }),
    );

    const result = await expireStaleSuggestions();

    expect(result).toMatchObject({ ok: true, expired: 2, configured: true });
    expect(updatePayloads[0]).toMatchObject({ status: "expired" });
    const events = insertPayloads[0] as Array<Record<string, unknown>>;
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      event_name: "money.ai_suggestion.expired",
      aggregate_type: "money_ai_suggestion",
      organization_id: "org-1",
      payload: { transaction_id: "t1", source: "ai" },
    });
    // Raw AI output never leaks into events.
    expect(JSON.stringify(events)).not.toContain("raw_output");
  });

  it("reports failure when the update is rejected", async () => {
    getServiceRoleClient.mockReturnValue(
      makeSupabase((table, op) => {
        if (op === "select") return { data: staleRows, error: null };
        if (op === "update") return { data: null, error: { message: "boom" } };
        return { data: null, error: null };
      }),
    );
    const result = await expireStaleSuggestions();
    expect(result).toMatchObject({ ok: false, expired: 0 });
  });
});
