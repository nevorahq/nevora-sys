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
 * can assert the soft-delete guard, and every `.eq(column, value)` filter so
 * we can assert the multi-org guard (organization_id must be applied to
 * every table read here — see Phase 4.4 audit), and resolves each query by
 * table. The two money_transactions reads (all-time vs monthly) are told
 * apart by whether `.gte` (the month lower-bound) was called.
 */
function makeSupabase(fixtures: {
  accounts?: Array<Record<string, unknown>>;
  all?: Array<Record<string, unknown>>;
  month?: Array<Record<string, unknown>>;
} = {}) {
  const isCalls: Array<[string, string]> = [];
  const eqCalls: Array<[string, string, unknown]> = [];
  const from = vi.fn((table: string) => {
    const state = { gte: false };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((column: string, value: unknown) => {
      eqCalls.push([table, column, value]);
      return builder;
    });
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
        return Promise.resolve({
          data: fixtures.accounts ?? [{ initial_balance: "0", currency: "MDL" }],
          error: null,
        });
      }
      // money_transactions: both all-time and monthly return the SAME posted,
      // non-deleted rows (income 22500, expense 100) → net 22400.
      const defaultTransactions = [
          { type: "income", amount: "22500", currency: "MDL" },
          { type: "expense", amount: "100", currency: "MDL" },
        ];
      return Promise.resolve({
        data: state.gte
          ? (fixtures.month ?? defaultTransactions)
          : (fixtures.all ?? defaultTransactions),
        error: null,
      });
    };
    (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      result().then(res, rej);
    return builder;
  });
  return { client: { from } as never, isCalls, eqCalls };
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

  it("scopes every table read to the active organization (Phase 4.4 regression)", async () => {
    // RLS alone (is_org_member) allows any org the user is active in — a user
    // active in 2+ orgs would otherwise see balances/transactions merged
    // across all of them. Every read here must carry an explicit
    // organization_id filter for the resolved active org (requireOrg()).
    const supabase = makeSupabase();
    createClient.mockResolvedValue(supabase.client);

    await getMoneySummary();

    const orgFilters = supabase.eqCalls.filter(([, column]) => column === "organization_id");
    expect(orgFilters).toContainEqual(["money_accounts", "organization_id", "org-1"]);
    // Both money_transactions reads (all-time + monthly) must be scoped.
    expect(orgFilters.filter(([table]) => table === "money_transactions")).toHaveLength(2);
    expect(orgFilters.every(([, , value]) => value === "org-1")).toBe(true);
  });

  it("moves cross-currency transfers between currency balance buckets without income/expense", async () => {
    requireOrg.mockResolvedValue({ org: { id: "org-1", baseCurrency: "EUR" } });
    getRatesToBase.mockResolvedValue({
      rates: new Map([["EUR", 1], ["USD", 0.92]]),
      complete: true,
    });
    const supabase = makeSupabase({
      accounts: [
        { initial_balance: "500", currency: "EUR" },
        { initial_balance: "100", currency: "USD" },
      ],
      all: [{
        type: "transfer",
        amount: "100",
        currency: "EUR",
        destination_amount: "108.45",
        destination_currency: "USD",
      }],
      month: [],
    });
    createClient.mockResolvedValue(supabase.client);

    const result = await getMoneySummary();

    expect(result.byCurrency).toEqual([
      { currency: "EUR", balance: 400, monthlyIncome: 0, monthlyExpenses: 0 },
      { currency: "USD", balance: 208.45, monthlyIncome: 0, monthlyExpenses: 0 },
    ]);
    expect(result.base.monthlyIncome).toBe(0);
    expect(result.base.monthlyExpenses).toBe(0);
  });
});
