import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const canDo = vi.fn();
const emitDomainEvent = vi.fn();
const revalidatePath = vi.fn();
const getDictionary = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
vi.mock("@/lib/context/current-context", () => ({ canDo }));
vi.mock("@/lib/events", () => ({ emitDomainEvent }));
vi.mock("@/shared/i18n/get-dictionary", () => ({ getDictionary }));

const { postPlannedTransactionAction } = await import("./post-planned-transaction.action");

const TX_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const ACC_ID = "44444444-4444-4444-8444-444444444444";

let executed: string[];
let updatePayloads: Record<string, unknown>;

function makeSupabase(resolver: (table: string, op: string) => unknown) {
  const from = vi.fn((table: string) => {
    const state = { op: "select" };
    const builder: Record<string, unknown> = {};
    builder.update = vi.fn((payload: Record<string, unknown>) => {
      updatePayloads[table] = payload;
      state.op = "update";
      return builder;
    });
    builder.select = vi.fn(() => builder);
    for (const m of ["eq", "is", "in"]) builder[m] = vi.fn(() => builder);
    const term = () => {
      executed.push(`${table}:${state.op}`);
      return Promise.resolve(resolver(table, state.op));
    };
    builder.maybeSingle = vi.fn(term);
    (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      term().then(res, rej);
    return builder;
  });
  return { from } as never;
}

/** Default: a USD draft on a USD account. */
function infra(over: { draft?: unknown; account?: unknown } = {}) {
  return (table: string, op: string) => {
    if (table === "money_transactions" && op === "select")
      return over.draft ?? { data: { id: TX_ID, account_id: ACC_ID, currency: "USD" }, error: null };
    if (table === "money_accounts") return over.account ?? { data: { currency: "USD" }, error: null };
    if (table === "money_transactions" && op === "update")
      return { data: { id: TX_ID, account_id: ACC_ID, amount: "10", type: "expense", currency: "USD", transaction_date: "2026-06-01" }, error: null };
    return { error: null };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  executed = [];
  updatePayloads = {};
  requireOrg.mockResolvedValue({ org: { id: ORG_ID }, workspace: { id: "ws" }, user: { id: USER_ID } });
  canDo.mockReturnValue(true);
  emitDomainEvent.mockResolvedValue(undefined);
  getDictionary.mockResolvedValue({
    dict: {
      money: {
        errors: {
          updateTransactionFailed: "update failed",
          currencyMismatch: "currency mismatch",
          serverError: "server error",
        },
      },
    },
  });
  createClient.mockResolvedValue(makeSupabase(infra()));
});

describe("postPlannedTransactionAction", () => {
  it("rejects an invalid id before loading context", async () => {
    await expect(postPlannedTransactionAction("nope")).resolves.toEqual({ error: "server error" });
    expect(requireOrg).not.toHaveBeenCalled();
  });

  it("rejects users without data.write permission", async () => {
    canDo.mockReturnValue(false);
    const result = await postPlannedTransactionAction(TX_ID);
    expect(result.error).toBe("server error");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("posts a same-currency planned draft and resolves its action item", async () => {
    const result = await postPlannedTransactionAction(TX_ID);

    expect(result).toEqual({});
    expect(updatePayloads.money_transactions).toMatchObject({ status: "posted", updated_by: USER_ID });
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "money.transaction.updated", aggregateId: TX_ID }),
    );
    expect(updatePayloads.action_items).toMatchObject({ status: "resolved" });
  });

  it("reassigns the draft to a compatible account passed by the caller", async () => {
    const OTHER_ACC = "55555555-5555-4555-8555-555555555555";
    createClient.mockResolvedValue(
      makeSupabase((table, op) => {
        if (table === "money_transactions" && op === "select")
          return { data: { id: TX_ID, account_id: ACC_ID, currency: "USD" }, error: null };
        // Caller-supplied account is looked up and matches USD.
        if (table === "money_accounts") return { data: { currency: "USD" }, error: null };
        if (table === "money_transactions" && op === "update")
          return { data: { id: TX_ID, account_id: OTHER_ACC, amount: "10", type: "expense", currency: "USD", transaction_date: "2026-06-01" }, error: null };
        return { error: null };
      }),
    );

    const result = await postPlannedTransactionAction(TX_ID, OTHER_ACC);

    expect(result).toEqual({});
    expect(updatePayloads.money_transactions).toMatchObject({ status: "posted", account_id: OTHER_ACC });
  });

  it("rejects an invalid account id", async () => {
    const result = await postPlannedTransactionAction(TX_ID, "not-a-uuid");
    expect(result.error).toBe("server error");
    expect(requireOrg).not.toHaveBeenCalled();
  });

  it("blocks posting when the account currency differs from the draft currency", async () => {
    createClient.mockResolvedValue(makeSupabase(infra({ account: { data: { currency: "MDL" }, error: null } })));

    const result = await postPlannedTransactionAction(TX_ID);

    expect(result.error).toBe("currency mismatch");
    expect(executed).not.toContain("money_transactions:update");
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });

  it("errors when no planned draft matched", async () => {
    createClient.mockResolvedValue(makeSupabase(infra({ draft: { data: null, error: null } })));

    const result = await postPlannedTransactionAction(TX_ID);

    expect(result.error).toBe("update failed");
    expect(executed).not.toContain("money_transactions:update");
  });
});
