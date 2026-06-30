import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyEntityOrganization } from "./verify-entity-organization";

const ORG_ID = "00000000-0000-4000-8000-000000000000";
const ID = "11111111-1111-4111-8111-111111111111";

/** Chained Supabase mock terminating in maybeSingle; records the queried table. */
function makeSupabase(row: { id: string } | null) {
  const tablesQueried: string[] = [];
  const from = vi.fn((table: string) => {
    tablesQueried.push(table);
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve({ data: row, error: null }));
    return builder;
  });
  return { client: { from } as never, tablesQueried };
}

beforeEach(() => vi.clearAllMocks());

describe("verifyEntityOrganization", () => {
  it("maps each active kind to its table and returns true when the row exists", async () => {
    const cases: Array<[string, string]> = [
      ["task", "todos"],
      ["document", "documents"],
      ["transaction", "money_transactions"],
      ["subscription", "subscriptions"],
    ];
    for (const [type, table] of cases) {
      const supabase = makeSupabase({ id: ID });
      const ok = await verifyEntityOrganization(supabase.client, ORG_ID, type, ID);
      expect(ok).toBe(true);
      expect(supabase.tablesQueried).toEqual([table]);
    }
  });

  it("fails closed for paused CRM types without touching the database", async () => {
    for (const type of ["client", "deal", "lead", "contact", "pipeline", "crm"]) {
      const supabase = makeSupabase({ id: ID });
      const ok = await verifyEntityOrganization(supabase.client, ORG_ID, type, ID);
      expect(ok).toBe(false);
      // Unsupported type must never reach a table query.
      expect(supabase.tablesQueried).toEqual([]);
    }
  });

  it("returns false when the active entity is not found in the org", async () => {
    const supabase = makeSupabase(null);
    const ok = await verifyEntityOrganization(supabase.client, ORG_ID, "document", ID);
    expect(ok).toBe(false);
    expect(supabase.tablesQueried).toEqual(["documents"]);
  });
});
