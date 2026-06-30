import { beforeEach, describe, expect, it, vi } from "vitest";

const emitDomainEvent = vi.fn();
const emitAuditLog = vi.fn();
const findDuplicateTransaction = vi.fn();

vi.mock("@/lib/events", () => ({ emitDomainEvent, emitAuditLog }));
vi.mock("@/modules/documents/services/duplicate-detection", () => ({ findDuplicateTransaction }));

const { createDraftTransactionFromDocument } = await import("./create-draft-transaction-from-document");

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const DOCUMENT_ID = "44444444-4444-4444-8444-444444444444";
const NEW_TX_ID = "55555555-5555-4555-8555-555555555555";
const OLD_TX_ID = "66666666-6666-4666-8666-666666666666";

const ctx = {
  org: { id: ORG_ID },
  workspace: { id: WORKSPACE_ID },
  user: { id: USER_ID },
} as never;

const input = {
  documentId: DOCUMENT_ID,
  extractionId: "ext-1",
  merchantName: "Acme Co",
  totalAmount: 99.5,
  currency: "EUR",
  transactionDate: "2026-06-01",
  categoryId: null,
  confidence: 0.9,
};

/**
 * Chainable Supabase mock. The terminal result of a query is resolved by
 * `resolver(table, op)` where `op` is the first of insert/update/delete/upsert
 * called (default "select"). Every executed terminal is recorded in `executed`
 * so tests can assert ordering and that a step never ran.
 */
let executed: string[];
let neqArgs: unknown[][];

function makeSupabase(resolver: (table: string, op: string) => unknown) {
  const from = vi.fn((table: string) => {
    const state = { op: "select" };
    const result = () => {
      executed.push(`${table}:${state.op}`);
      return Promise.resolve(resolver(table, state.op));
    };
    const builder: Record<string, unknown> = {};
    const setOp = (o: string) => {
      state.op = o;
      return builder;
    };
    builder.insert = vi.fn(() => setOp("insert"));
    builder.update = vi.fn(() => setOp("update"));
    builder.delete = vi.fn(() => setOp("delete"));
    builder.upsert = vi.fn(() => setOp("upsert"));
    builder.select = vi.fn(() => builder);
    builder.neq = vi.fn((...args: unknown[]) => {
      neqArgs.push(args);
      return builder;
    });
    for (const m of ["eq", "is", "in", "order", "limit", "gte", "lte"]) {
      builder[m] = vi.fn(() => builder);
    }
    builder.maybeSingle = vi.fn(result);
    builder.single = vi.fn(result);
    (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      result().then(res, rej);
    return builder;
  });
  return { from } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  executed = [];
  neqArgs = [];
  emitDomainEvent.mockResolvedValue(undefined);
  emitAuditLog.mockResolvedValue(undefined);
  findDuplicateTransaction.mockResolvedValue({ isDuplicate: false, matchedTransactionId: null });
});

describe("createDraftTransactionFromDocument", () => {
  it("returns no_account when the org has no active account", async () => {
    const supabase = makeSupabase((table, _op) => {
      if (table === "money_accounts") return { data: null };
      return { data: null, error: null };
    });

    const result = await createDraftTransactionFromDocument(supabase, ctx, input);
    expect(result).toEqual({
      ok: false,
      errorCode: "no_account",
      errorMessage: expect.any(String),
    });
    expect(executed).not.toContain("money_transactions:insert");
  });

  it("returns already_confirmed and inserts nothing when the document already has a posted transaction", async () => {
    const supabase = makeSupabase((table, op) => {
      // The idempotency guard runs first: a posted tx already exists for the doc.
      if (table === "money_transactions" && op === "select") return { data: { id: OLD_TX_ID }, error: null };
      if (table === "money_accounts") return { data: { id: "acc-1" } };
      return { data: null, error: null };
    });

    const result = await createDraftTransactionFromDocument(supabase, ctx, input);

    expect(result).toEqual({
      ok: false,
      errorCode: "already_confirmed",
      existingTransactionId: OLD_TX_ID,
      errorMessage: expect.any(String),
    });
    // No draft is minted and no prior drafts are touched.
    expect(executed).not.toContain("money_transactions:insert");
    expect(executed).not.toContain("money_transactions:update");
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });

  it("inserts the new draft BEFORE superseding prior drafts, excluding the new row", async () => {
    const supabase = makeSupabase((table, op) => {
      if (table === "money_accounts") return { data: { id: "acc-1" } };
      if (table === "money_transactions" && op === "insert") return { data: { id: NEW_TX_ID }, error: null };
      if (table === "money_transactions" && op === "update") return { data: [{ id: OLD_TX_ID }], error: null };
      if (table === "action_items") return { error: null };
      return { data: null, error: null };
    });

    const result = await createDraftTransactionFromDocument(supabase, ctx, input);

    expect(result).toEqual({ ok: true, transactionId: NEW_TX_ID, duplicateOfId: null });
    // Ordering: insert must run before the supersede update.
    const insertIdx = executed.indexOf("money_transactions:insert");
    const updateIdx = executed.indexOf("money_transactions:update");
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(updateIdx).toBeGreaterThan(insertIdx);
    // Supersede excludes the freshly inserted row.
    expect(neqArgs).toContainEqual(["id", NEW_TX_ID]);
    // Stale review items for superseded drafts are dismissed.
    expect(executed).toContain("action_items:update");
  });

  it("does NOT supersede prior drafts when the insert fails", async () => {
    const supabase = makeSupabase((table, op) => {
      if (table === "money_accounts") return { data: { id: "acc-1" } };
      if (table === "money_transactions" && op === "insert") return { data: null, error: { message: "boom" } };
      return { data: null, error: null };
    });

    const result = await createDraftTransactionFromDocument(supabase, ctx, input);

    expect(result).toEqual({
      ok: false,
      errorCode: "transaction_creation_failed",
      errorMessage: expect.any(String),
    });
    // The regression: a failed insert must never destroy the previous draft.
    expect(executed).not.toContain("money_transactions:update");
    expect(executed).not.toContain("action_items:update");
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });

  it("does not dismiss action items when no prior drafts were superseded", async () => {
    const supabase = makeSupabase((table, op) => {
      if (table === "money_accounts") return { data: { id: "acc-1" } };
      if (table === "money_transactions" && op === "insert") return { data: { id: NEW_TX_ID }, error: null };
      if (table === "money_transactions" && op === "update") return { data: [], error: null };
      return { error: null };
    });

    const result = await createDraftTransactionFromDocument(supabase, ctx, input);

    expect(result.ok).toBe(true);
    expect(executed).not.toContain("action_items:update");
  });
});
