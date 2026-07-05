import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  builders: [] as Array<{
    table: string;
    eqCalls: Array<[string, unknown]>;
    isCalls: Array<[string, unknown]>;
    result: { data: unknown; error: unknown };
  }>,
}));

function createBuilder(table: string) {
  const state = {
    table,
    eqCalls: [] as Array<[string, unknown]>,
    isCalls: [] as Array<[string, unknown]>,
    result: { data: [], error: null },
  };
  mocks.builders.push(state);

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      state.eqCalls.push([column, value]);
      return builder;
    }),
    is: vi.fn((column: string, value: unknown) => {
      state.isCalls.push([column, value]);
      return builder;
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => state.result),
    then: (resolve: (value: typeof state.result) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(state.result).then(resolve, reject),
  };

  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => createBuilder(table),
  }),
}));

const { getDocumentById } = await import("./get-document-by-id");
const { getDocumentSummary, getDocuments } = await import("./get-documents");

describe("document query soft-delete contract", () => {
  beforeEach(() => {
    mocks.builders.length = 0;
  });

  it("filters document lists to active rows", async () => {
    await getDocuments("org-1");

    expect(mocks.builders[0]?.table).toBe("documents");
    expect(mocks.builders[0]?.isCalls).toContainEqual(["deleted_at", null]);
  });

  it("filters document summary counts to active rows", async () => {
    await getDocumentSummary("org-1");

    expect(mocks.builders[0]?.table).toBe("documents");
    expect(mocks.builders[0]?.isCalls).toContainEqual(["deleted_at", null]);
  });

  it("does not return a soft-deleted detail row", async () => {
    await getDocumentById("org-1", "94bd07e5-57b2-4766-bee7-7b97ac130f32");

    expect(mocks.builders[0]?.table).toBe("documents");
    expect(mocks.builders[0]?.isCalls).toContainEqual(["deleted_at", null]);
  });
});
