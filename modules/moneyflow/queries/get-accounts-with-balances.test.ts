import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { getAccountsWithBalances } = await import("./get-accounts-with-balances");

function queryResult(data: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  (builder as { then: unknown }).then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve);
  return builder;
}

function makeClient(transactions: Array<Record<string, unknown>>) {
  const accounts = [
    { id: "eur", initial_balance: "500", currency: "EUR", is_active: true },
    { id: "usd", initial_balance: "100", currency: "USD", is_active: true },
  ];
  return {
    from: vi.fn((table: string) => queryResult(table === "money_accounts" ? accounts : transactions)),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("getAccountsWithBalances transfers", () => {
  it("subtracts source amount and adds destination amount for 100 EUR → 108.45 USD", async () => {
    createClient.mockResolvedValue(makeClient([{
      type: "transfer",
      amount: "100",
      destination_amount: "108.45",
      from_account_id: "eur",
      to_account_id: "usd",
    }]));

    const result = await getAccountsWithBalances("org-1");

    expect(result.find((account) => account.id === "eur")?.balance).toBe(400);
    expect(result.find((account) => account.id === "usd")?.balance).toBe(208.45);
  });

  it("supports the reverse USD → EUR direction", async () => {
    createClient.mockResolvedValue(makeClient([{
      type: "transfer",
      amount: "50",
      destination_amount: "46.10",
      from_account_id: "usd",
      to_account_id: "eur",
    }]));

    const result = await getAccountsWithBalances("org-1");

    expect(result.find((account) => account.id === "usd")?.balance).toBe(50);
    expect(result.find((account) => account.id === "eur")?.balance).toBe(546.1);
  });

  it("keeps same-currency transfers net-zero across account balances", async () => {
    createClient.mockResolvedValue(makeClient([{
      type: "transfer",
      amount: "25",
      destination_amount: "25",
      from_account_id: "eur",
      to_account_id: "usd",
    }]));

    const result = await getAccountsWithBalances("org-1");
    expect(result.reduce((sum, account) => sum + account.balance, 0)).toBe(600);
  });

  it("restores both balances when the transfer row is absent after deletion", async () => {
    createClient.mockResolvedValue(makeClient([]));

    const result = await getAccountsWithBalances("org-1");
    expect(result.map((account) => account.balance)).toEqual([500, 100]);
  });
});
