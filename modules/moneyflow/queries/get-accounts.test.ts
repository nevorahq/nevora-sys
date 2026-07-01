import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { getAccounts } = await import("./get-accounts");

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
    builder.order = vi.fn(() => builder);
    (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(res, rej);
    return builder;
  });
  return { client: { from } as never, eqCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAccounts", () => {
  it("scopes the account read to the given organization (Phase 4.4 regression)", async () => {
    // RLS alone (is_org_member) allows any org the user is active in — without
    // an explicit organization_id filter, a user active in 2+ orgs would see
    // accounts merged across all of them.
    const supabase = makeSupabase();
    createClient.mockResolvedValue(supabase.client);

    await getAccounts("org-1");

    expect(supabase.eqCalls).toContainEqual(["money_accounts", "organization_id", "org-1"]);
  });
});
