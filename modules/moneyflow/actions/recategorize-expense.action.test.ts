import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const canDo = vi.fn();
const emitAuditLog = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
vi.mock("@/lib/context/current-context", () => ({ canDo }));
vi.mock("@/lib/events", () => ({ emitAuditLog }));

const { recategorizeExpenseAction } = await import("./recategorize-expense.action");

const TX_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const CAT_ID = "44444444-4444-4444-8444-444444444444";
const CTX_ID = "55555555-5555-4555-8555-555555555555";

let executed: string[];
let insertPayloads: Record<string, unknown>;
let updatePayloads: Record<string, unknown>;

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
    for (const m of ["eq", "is"]) builder[m] = vi.fn(() => builder);
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

/** Default infra: a posted expense, valid org category + org context. */
function infra(overrides: { tx?: unknown; category?: unknown; context?: unknown } = {}) {
  return (table: string, op: string) => {
    if (table === "money_transactions" && op === "select")
      return overrides.tx ?? { data: { id: TX_ID, merchant_name: "Bolt SRL", title: "Bolt", type: "expense" }, error: null };
    if (table === "money_categories")
      return overrides.category ?? { data: { id: CAT_ID }, error: null };
    if (table === "expense_contexts")
      return overrides.context ?? { data: { id: CTX_ID, visibility: "organization", owner_user_id: null }, error: null };
    if (table === "money_transactions" && op === "update")
      return { data: { id: TX_ID, category_id: CAT_ID, expense_context_id: CTX_ID }, error: null };
    if (table === "expense_classification_rules" && op === "select") return { data: null, error: null };
    return { error: null };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  executed = [];
  insertPayloads = {};
  updatePayloads = {};
  requireOrg.mockResolvedValue({ org: { id: ORG_ID }, workspace: { id: "ws" }, user: { id: USER_ID } });
  canDo.mockReturnValue(true);
  emitAuditLog.mockResolvedValue(undefined);
  createClient.mockResolvedValue(makeSupabase(infra()));
});

const validInput = { transactionId: TX_ID, categoryId: CAT_ID, expenseContextId: CTX_ID, rememberChoice: false };

describe("recategorizeExpenseAction", () => {
  it("rejects malformed input before loading context", async () => {
    const result = await recategorizeExpenseAction({ ...validInput, categoryId: "nope" });
    expect(result.error).toMatch(/valid category/i);
    expect(requireOrg).not.toHaveBeenCalled();
  });

  it("rejects users without data.write permission", async () => {
    canDo.mockReturnValue(false);
    const result = await recategorizeExpenseAction(validInput);
    expect(result.error).toMatch(/permission/i);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("updates the transaction and records a manual classification decision", async () => {
    const result = await recategorizeExpenseAction(validInput);

    expect(result).toEqual({});
    expect(updatePayloads.money_transactions).toMatchObject({
      category_id: CAT_ID,
      expense_context_id: CTX_ID,
      visibility: "organization",
      owner_user_id: null,
      updated_by: USER_ID,
    });
    expect(insertPayloads.transaction_classifications).toMatchObject({ method: "manual", category_confidence: 1 });
    // No rule saved when the user did not opt in.
    expect(executed).not.toContain("expense_classification_rules:insert");
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("saves a private merchant rule when the user opts in", async () => {
    const result = await recategorizeExpenseAction({ ...validInput, rememberChoice: true });

    expect(result).toEqual({});
    expect(insertPayloads.expense_classification_rules).toMatchObject({
      normalized_merchant: "bolt",
      owner_user_id: USER_ID,
      visibility: "private",
    });
  });

  it("errors when the transaction is not an editable posted expense", async () => {
    createClient.mockResolvedValue(makeSupabase(infra({ tx: { data: null, error: null } })));
    const result = await recategorizeExpenseAction(validInput);
    expect(result.error).toMatch(/not found|no longer editable/i);
    expect(executed).not.toContain("money_transactions:update");
  });

  it("rejects another member's private context", async () => {
    createClient.mockResolvedValue(
      makeSupabase(infra({ context: { data: { id: CTX_ID, visibility: "private", owner_user_id: "someone-else" }, error: null } })),
    );
    const result = await recategorizeExpenseAction(validInput);
    expect(result.error).toMatch(/private expense context/i);
    expect(executed).not.toContain("money_transactions:update");
  });
});
