import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const canDo = vi.fn();
const emitDomainEvent = vi.fn();
const emitAuditLog = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
vi.mock("@/lib/context/current-context", () => ({ canDo }));
vi.mock("@/lib/events", () => ({ emitDomainEvent, emitAuditLog }));

const { confirmDocumentTransactionAction } = await import("./confirm-document-transaction.action");

const TX_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const DOC_ID = "44444444-4444-4444-8444-444444444444";
const ACC_EUR = "55555555-5555-4555-8555-555555555555";
const ACC_MDL = "66666666-6666-4666-8666-666666666666";

let executed: string[];
let updatePayloads: Record<string, unknown>;
let insertPayloads: Record<string, unknown>;

/** Op-aware Supabase mock. `resolver(table, op)` resolves each terminal query. */
function makeSupabase(resolver: (table: string, op: string) => unknown) {
  const from = vi.fn((table: string) => {
    const state = { op: "select" };
    const builder: Record<string, unknown> = {};
    const setOp = (o: string) => {
      state.op = o;
      return builder;
    };
    builder.update = vi.fn((payload: Record<string, unknown>) => {
      updatePayloads[table] = payload;
      return setOp("update");
    });
    builder.insert = vi.fn((payload: Record<string, unknown>) => {
      insertPayloads[table] = payload;
      return setOp("insert");
    });
    builder.select = vi.fn(() => builder);
    builder.not = vi.fn(() => builder);
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

/** Default infra: an EUR draft on an EUR account. */
function infra(overrides: { draft?: unknown; account?: unknown } = {}) {
  return (table: string, op: string) => {
    if (table === "money_transactions" && op === "select")
      return overrides.draft ?? { data: { id: TX_ID, currency: "EUR", account_id: ACC_EUR }, error: null };
    if (table === "money_accounts")
      return overrides.account ?? { data: { id: ACC_EUR, currency: "EUR" }, error: null };
    if (table === "money_transactions" && op === "update")
      return { data: { id: TX_ID, amount: "50", type: "expense", source_document_id: DOC_ID }, error: null };
    return { error: null };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  executed = [];
  updatePayloads = {};
  insertPayloads = {};
  requireOrg.mockResolvedValue({ org: { id: ORG_ID }, workspace: { id: "ws" }, user: { id: USER_ID } });
  canDo.mockReturnValue(true);
  emitDomainEvent.mockResolvedValue(undefined);
  emitAuditLog.mockResolvedValue(undefined);
  createClient.mockResolvedValue(makeSupabase(infra()));
});

describe("confirmDocumentTransactionAction", () => {
  it("rejects an invalid transaction id before loading context", async () => {
    await expect(confirmDocumentTransactionAction("nope")).resolves.toEqual({ error: "Invalid transaction ID." });
    expect(requireOrg).not.toHaveBeenCalled();
  });

  it("rejects an invalid account id", async () => {
    await expect(confirmDocumentTransactionAction(TX_ID, "nope")).resolves.toEqual({ error: "Invalid account ID." });
    expect(requireOrg).not.toHaveBeenCalled();
  });

  it("rejects users without data.write permission", async () => {
    canDo.mockReturnValue(false);
    const result = await confirmDocumentTransactionAction(TX_ID);
    expect(result.error).toMatch(/permission/i);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("posts the draft onto its same-currency account, emits events, resolves the action item", async () => {
    const result = await confirmDocumentTransactionAction(TX_ID);

    expect(result).toEqual({});
    expect(updatePayloads.money_transactions).toMatchObject({ status: "posted", account_id: ACC_EUR, updated_by: USER_ID });
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "money.transaction.confirmed", aggregateId: TX_ID }),
    );
    expect(updatePayloads.action_items).toMatchObject({ status: "resolved" });
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/documents/${DOC_ID}`);
  });

  it("blocks posting when the account currency differs from the draft currency", async () => {
    createClient.mockResolvedValue(makeSupabase(infra({ account: { data: { id: ACC_MDL, currency: "MDL" }, error: null } })));

    const result = await confirmDocumentTransactionAction(TX_ID);

    expect(result.code).toBe("currency_mismatch");
    expect(result.requiredCurrency).toBe("EUR");
    expect(result.error).toMatch(/EUR/);
    // The mismatch must prevent the posting update entirely.
    expect(executed).not.toContain("money_transactions:update");
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });

  it("reassigns the draft to a compatible account passed by the caller", async () => {
    // Draft sits on an MDL account; user confirms with a EUR account.
    createClient.mockResolvedValue(
      makeSupabase((table, op) => {
        if (table === "money_transactions" && op === "select")
          return { data: { id: TX_ID, currency: "EUR", account_id: ACC_MDL }, error: null };
        if (table === "money_accounts") return { data: { id: ACC_EUR, currency: "EUR" }, error: null };
        if (table === "money_transactions" && op === "update")
          return { data: { id: TX_ID, amount: "50", type: "expense", source_document_id: DOC_ID }, error: null };
        return { error: null };
      }),
    );

    const result = await confirmDocumentTransactionAction(TX_ID, ACC_EUR);

    expect(result).toEqual({});
    expect(updatePayloads.money_transactions).toMatchObject({ status: "posted", account_id: ACC_EUR });
  });

  it("errors when the selected account is unavailable", async () => {
    createClient.mockResolvedValue(makeSupabase(infra({ account: { data: null, error: null } })));

    const result = await confirmDocumentTransactionAction(TX_ID);

    expect(result.error).toMatch(/unavailable/i);
    expect(executed).not.toContain("money_transactions:update");
  });

  it("returns an error and skips events when no planned draft matched", async () => {
    createClient.mockResolvedValue(makeSupabase(infra({ draft: { data: null, error: null } })));

    const result = await confirmDocumentTransactionAction(TX_ID);

    expect(result.error).toMatch(/not found or already confirmed/i);
    expect(emitDomainEvent).not.toHaveBeenCalled();
    expect(executed).not.toContain("action_items:update");
  });

  it("posts reviewed classification privately and remembers an opted-in merchant rule", async () => {
    createClient.mockResolvedValue(
      makeSupabase((table, op) => {
        if (table === "money_transactions" && op === "select") {
          return {
            data: {
              id: TX_ID,
              currency: "EUR",
              account_id: ACC_EUR,
              merchant_name: "Bolt SRL",
              category_id: null,
              expense_context_id: null,
              visibility: "organization",
              owner_user_id: null,
            },
            error: null,
          };
        }
        if (table === "money_accounts") return { data: { id: ACC_EUR, currency: "EUR" }, error: null };
        if (table === "money_categories") return { data: { id: "77777777-7777-4777-8777-777777777777" }, error: null };
        if (table === "expense_contexts") {
          return { data: { id: "88888888-8888-4888-8888-888888888888", visibility: "private", owner_user_id: USER_ID }, error: null };
        }
        if (table === "money_transactions" && op === "update") {
          return {
            data: {
              id: TX_ID,
              amount: "50",
              type: "expense",
              source_document_id: DOC_ID,
              category_id: "77777777-7777-4777-8777-777777777777",
              expense_context_id: "88888888-8888-4888-8888-888888888888",
              visibility: "private",
              owner_user_id: USER_ID,
              merchant_name: "Bolt SRL",
            },
            error: null,
          };
        }
        if (table === "expense_classification_rules" && op === "select") return { data: null, error: null };
        return { error: null };
      }),
    );

    const result = await confirmDocumentTransactionAction(TX_ID, undefined, {
      categoryId: "77777777-7777-4777-8777-777777777777",
      expenseContextId: "88888888-8888-4888-8888-888888888888",
      rememberChoice: true,
      merchantName: "Bolt SRL",
      amount: 50,
      transactionDate: "2026-06-28",
      currency: "EUR",
    });

    expect(result).toEqual({});
    expect(updatePayloads.money_transactions).toMatchObject({
      category_id: "77777777-7777-4777-8777-777777777777",
      expense_context_id: "88888888-8888-4888-8888-888888888888",
      visibility: "private",
      owner_user_id: USER_ID,
      merchant_name: "Bolt SRL",
      amount: 50,
      transaction_date: "2026-06-28",
      currency: "EUR",
    });
    expect(insertPayloads.transaction_classifications).toMatchObject({ method: "manual", visibility: "private" });
    expect(insertPayloads.expense_classification_rules).toMatchObject({
      normalized_merchant: "bolt",
      owner_user_id: USER_ID,
      visibility: "private",
    });
  });
});
