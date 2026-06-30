import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const getRatesToBase = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
vi.mock("./fx-conversion", () => ({ getRatesToBase }));

const { getMoneySummary } = await import("./get-money-summary");

/**
 * Chainable Supabase mock that records every `.is(column, null)` filter so we
 * can assert the soft-delete guard, and resolves each query by table. The two
 * money_transactions reads (all-time vs monthly) are told apart by whether
 * `.gte` (the month lower-bound) was called.
 */
function makeSupabase() {
  const isCalls: Array<[string, string]> = [];
  const from = vi.fn((table: string) => {
    const state = { gte: false };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.lt = vi.fn(() => builder);
    builder.gte = vi.fn(() => {
      state.gte = true;
      return builder;
    });
    builder.is = vi.fn((column: string) => {
      isCalls.push([table, column]);
      return builder;
    });
    const result = () => {
      if (table === "money_accounts") {
        return Promise.resolve({ data: [{ initial_balance: "0", currency: "MDL" }], error: null });
      }
      // money_transactions: both all-time and monthly return the SAME posted,
      // non-deleted rows (income 22500, expense 100) → net 22400.
      return Promise.resolve({
        data: [
          { type: "income", amount: "22500", currency: "MDL" },
          { type: "expense", amount: "100", currency: "MDL" },
        ],
        error: null,
      });
    };
    (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      result().then(res, rej);
    return builder;
  });
  return { client: { from } as never, isCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOrg.mockResolvedValue({ org: { id: "org-1", baseCurrency: "MDL" } });
  getRatesToBase.mockResolvedValue({ rates: new Map([["MDL", 1]]), complete: true });
});

describe("getMoneySummary", () => {
  it("excludes soft-deleted rows from balance (matches the canonical RPC)", async () => {
    const supabase = makeSupabase();
    createClient.mockResolvedValue(supabase.client);

    const result = await getMoneySummary();

    // The soft-delete guard must be applied to accounts AND both tx reads.
    expect(supabase.isCalls).toContainEqual(["money_accounts", "deleted_at"]);
    expect(supabase.isCalls.filter(([t]) => t === "money_transactions")).toHaveLength(2);

    // initial 0 + income 22500 − expense 100 = 22400 (not a leaked, smaller value).
    const mdl = result.byCurrency.find((row) => row.currency === "MDL");
    expect(mdl?.balance).toBe(22400);
    expect(mdl?.monthlyIncome).toBe(22500);
    expect(mdl?.monthlyExpenses).toBe(100);
    expect(result.base.balance).toBe(22400);
  });
});
