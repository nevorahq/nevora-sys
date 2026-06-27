import { beforeEach, describe, expect, it, vi } from "vitest";

const runDocumentExtraction = vi.fn();
const getServiceRoleClient = vi.fn();

vi.mock("./document-extraction-service", () => ({ runDocumentExtraction }));
vi.mock("@/lib/supabase/service-role", () => ({ getServiceRoleClient }));

const { runExtractionSweep } = await import("./extraction-worker");

let executed: string[];

/**
 * Op-aware mock: `document_extractions` is used twice — an `update` (reap stale
 * processing) and a `select` (pick up lost pending). Both chains are awaited.
 */
function makeSupabase(resolver: (table: string, op: string) => unknown) {
  return {
    from: vi.fn((table: string) => {
      const state = { op: "select" };
      const builder: Record<string, unknown> = {};
      builder.update = vi.fn(() => {
        state.op = "update";
        return builder;
      });
      builder.select = vi.fn(() => builder);
      for (const m of ["eq", "is", "lt", "order", "limit"]) builder[m] = vi.fn(() => builder);
      (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        executed.push(`${table}:${state.op}`);
        return Promise.resolve(resolver(table, state.op)).then(res, rej);
      };
      return builder;
    }),
  } as never;
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: "ext-" + Math.random().toString(36).slice(2, 7),
    document_id: "doc-1",
    organization_id: "org-1",
    workspace_id: "ws-1",
    created_by: "user-1",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  executed = [];
  runDocumentExtraction.mockResolvedValue({ ok: true, extractionId: "x", status: "completed" });
});

describe("runExtractionSweep", () => {
  it("returns ran:false when no service-role client is configured", async () => {
    getServiceRoleClient.mockReturnValue(null);

    const result = await runExtractionSweep();

    expect(result).toEqual({ ran: false, reaped: 0, recovered: 0, recoveryFailures: 0 });
    expect(runDocumentExtraction).not.toHaveBeenCalled();
  });

  it("reaps stale processing jobs and recovers lost pending jobs", async () => {
    const client = makeSupabase((table, op) => {
      if (table === "document_extractions" && op === "update") return { data: [{ id: "a" }, { id: "b" }], error: null };
      if (table === "document_extractions" && op === "select") return { data: [row(), row()], error: null };
      return { data: null, error: null };
    });

    const result = await runExtractionSweep({ client });

    expect(result.ran).toBe(true);
    expect(result.reaped).toBe(2);
    expect(result.recovered).toBe(2);
    expect(result.recoveryFailures).toBe(0);
    expect(runDocumentExtraction).toHaveBeenCalledTimes(2);
  });

  it("skips pending rows with incomplete tenant scope instead of guessing", async () => {
    const client = makeSupabase((table, op) => {
      if (op === "update") return { data: [], error: null };
      if (op === "select") return { data: [row({ workspace_id: null }), row({ created_by: null })], error: null };
      return { data: null, error: null };
    });

    const result = await runExtractionSweep({ client });

    expect(result.recovered).toBe(0);
    expect(result.recoveryFailures).toBe(2);
    expect(runDocumentExtraction).not.toHaveBeenCalled();
  });

  it("counts a failed run as a recovery failure", async () => {
    runDocumentExtraction.mockResolvedValue({ ok: false, extractionId: "x", status: "failed" });
    const client = makeSupabase((table, op) => {
      if (op === "update") return { data: [], error: null };
      if (op === "select") return { data: [row()], error: null };
      return { data: null, error: null };
    });

    const result = await runExtractionSweep({ client });

    expect(result.recovered).toBe(0);
    expect(result.recoveryFailures).toBe(1);
  });

  it("treats a needs_review run as recovered", async () => {
    runDocumentExtraction.mockResolvedValue({ ok: true, extractionId: "x", status: "needs_review" });
    const client = makeSupabase((table, op) => {
      if (op === "update") return { data: [], error: null };
      if (op === "select") return { data: [row()], error: null };
      return { data: null, error: null };
    });

    const result = await runExtractionSweep({ client });

    expect(result.recovered).toBe(1);
    expect(result.recoveryFailures).toBe(0);
  });
});
