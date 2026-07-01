import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const getRatesToBase = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
vi.mock("./fx-conversion", () => ({ getRatesToBase, sumInBase: vi.fn(() => 0) }));

const { getUpcomingExpenses } = await import("./get-upcoming-expenses");

/** Chainable Supabase mock recording every `.eq(column, value)` filter. */
function makeSupabase() {
  const eqCalls: Array<[string, string, unknown]> = [];
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((column: string, value: unknown) => {
      eqCalls.push([table, column, value]);
      return builder;
    });
    builder.gte = vi.fn(() => builder);
    builder.lte = vi.fn(() => builder);
    (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(res, rej);
    return builder;
  });
  return { client: { from } as never, eqCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOrg.mockResolvedValue({ org: { id: "org-1", baseCurrency: "MDL" } });
  getRatesToBase.mockResolvedValue({ rates: new Map(), complete: true });
});

describe("getUpcomingExpenses", () => {
  it("scopes the planned-expense read to the active organization (Phase 4.4 regression)", async () => {
    // RLS alone (is_org_member) allows any org the user is active in — without
    // an explicit organization_id filter, a user active in 2+ orgs would see
    // upcoming-expense forecasts merged across all of them.
    const supabase = makeSupabase();
    createClient.mockResolvedValue(supabase.client);

    await getUpcomingExpenses();

    expect(supabase.eqCalls).toContainEqual(["money_transactions", "organization_id", "org-1"]);
  });
});
