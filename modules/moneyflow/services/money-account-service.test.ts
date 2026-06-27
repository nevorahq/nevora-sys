import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createMoneyAccount, findActiveMoneyAccountsByCurrency } = await import("./money-account-service");

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";

const ctx = {
  org: { id: ORG_ID },
  workspace: { id: WORKSPACE_ID },
  user: { id: USER_ID },
} as never;

let filters: Array<[string, unknown]>;
let insertPayload: Record<string, unknown> | null;

function queryBuilder(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "order"]) builder[method] = vi.fn(() => builder);
  builder.eq = vi.fn((field: string, value: unknown) => {
    filters.push([field, value]);
    return builder;
  });
  builder.is = vi.fn((field: string, value: unknown) => {
    filters.push([field, value]);
    return builder;
  });
  builder.single = vi.fn(async () => result);
  builder.maybeSingle = vi.fn(async () => result);
  (builder as { then: unknown }).then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

beforeEach(() => {
  filters = [];
  insertPayload = null;
});

describe("findActiveMoneyAccountsByCurrency", () => {
  it("scopes lookup to active, non-deleted accounts in the organization and currency", async () => {
    const builder = queryBuilder({ data: [], error: null });
    const supabase = { from: vi.fn(() => builder) } as never;

    await findActiveMoneyAccountsByCurrency(supabase, ORG_ID, "USD");

    expect(filters).toEqual(expect.arrayContaining([
      ["organization_id", ORG_ID],
      ["currency", "USD"],
      ["is_active", true],
      ["deleted_at", null],
    ]));
  });
});

describe("createMoneyAccount", () => {
  it("inserts an active account with server-derived attribution", async () => {
    const result = { data: { id: "account-1", name: "USD Account", currency: "USD" }, error: null };
    const builder = queryBuilder(result);
    builder.insert = vi.fn((payload: Record<string, unknown>) => {
      insertPayload = payload;
      return builder;
    });
    const supabase = { from: vi.fn(() => builder) } as never;

    await expect(createMoneyAccount(supabase, ctx, {
      name: "USD Account",
      type: "card",
      initialBalance: 0,
      currency: "USD",
      creationRequestId: REQUEST_ID,
    })).resolves.toEqual({
      ok: true,
      account: result.data,
      created: true,
    });

    expect(insertPayload).toMatchObject({
      organization_id: ORG_ID,
      workspace_id: WORKSPACE_ID,
      created_by: USER_ID,
      updated_by: USER_ID,
      creation_request_id: REQUEST_ID,
      currency: "USD",
      is_active: true,
    });
  });

  it("returns the original active account after an idempotency collision", async () => {
    const insertBuilder = queryBuilder({ data: null, error: { code: "23505" } });
    insertBuilder.insert = vi.fn(() => insertBuilder);
    const lookupBuilder = queryBuilder({
      data: { id: "account-1", name: "USD Account", currency: "USD" },
      error: null,
    });
    const from = vi
      .fn()
      .mockReturnValueOnce(insertBuilder)
      .mockReturnValueOnce(lookupBuilder);

    await expect(createMoneyAccount({ from } as never, ctx, {
      name: "USD Account",
      type: "card",
      initialBalance: 0,
      currency: "USD",
      creationRequestId: REQUEST_ID,
    })).resolves.toMatchObject({
      ok: true,
      created: false,
      account: { id: "account-1", currency: "USD" },
    });

    expect(filters).toEqual(expect.arrayContaining([
      ["organization_id", ORG_ID],
      ["creation_request_id", REQUEST_ID],
      ["is_active", true],
      ["deleted_at", null],
    ]));
  });
});
