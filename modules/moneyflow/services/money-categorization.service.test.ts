import { beforeEach, describe, expect, it, vi } from "vitest";

const emitDomainEvent = vi.fn();
const suggestCategoryWithAi = vi.fn();

vi.mock("@/lib/events", () => ({ emitDomainEvent, emitAuditLog: vi.fn() }));
vi.mock("./ai-category-suggestion", () => ({ suggestCategoryWithAi }));

const { categorizeTransaction } = await import("./money-categorization.service");

const TX_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const CAT_ID = "44444444-4444-4444-8444-444444444444";
const SUGGESTION_ID = "55555555-5555-4555-8555-555555555555";

const ctx = {
  org: { id: ORG_ID },
  workspace: { id: "ws" },
  user: { id: USER_ID },
} as never;

let executed: string[];
let updatePayloads: Record<string, unknown[]>;
let insertPayloads: Record<string, unknown[]>;

/**
 * Chainable Supabase fake: every filter/order method returns the builder;
 * terminals (single/maybeSingle/await) resolve through the resolver, which
 * receives the per-table+op call index so repeated selects can differ.
 */
function makeSupabase(resolver: (table: string, op: string, call: number) => unknown) {
  const counters = new Map<string, number>();
  const from = vi.fn((table: string) => {
    const state = { op: "select" };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.update = vi.fn((payload: Record<string, unknown>) => {
      state.op = "update";
      (updatePayloads[table] ??= []).push(payload);
      return builder;
    });
    builder.insert = vi.fn((payload: Record<string, unknown>) => {
      state.op = "insert";
      (insertPayloads[table] ??= []).push(payload);
      return builder;
    });
    for (const m of ["eq", "is", "in", "not", "neq", "gte", "lt", "order", "limit"]) {
      builder[m] = vi.fn(() => builder);
    }
    const term = () => {
      const key = `${table}:${state.op}`;
      const call = counters.get(key) ?? 0;
      counters.set(key, call + 1);
      executed.push(key);
      return Promise.resolve(resolver(table, state.op, call));
    };
    builder.maybeSingle = vi.fn(term);
    builder.single = vi.fn(term);
    (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      term().then(res, rej);
    return builder;
  });
  return { from } as never;
}

const baseTx = {
  id: TX_ID,
  title: "Bolt ride",
  note: null,
  type: "expense",
  amount: 12.5,
  currency: "EUR",
  transaction_date: "2026-07-01",
  merchant_name: "Bolt SRL",
  category_id: null,
  categorization_status: "uncategorized",
  visibility: "organization",
  owner_user_id: null,
};

type ResolverOverrides = Partial<Record<string, (op: string, call: number) => unknown>>;

function resolver(overrides: ResolverOverrides = {}) {
  return (table: string, op: string, call: number) => {
    const custom = overrides[table];
    if (custom) {
      const result = custom(op, call);
      if (result !== undefined) return result;
    }
    if (table === "money_transactions" && op === "select" && call === 0)
      return { data: baseTx, error: null };
    if (table === "money_transactions" && op === "select")
      return { data: [], error: null }; // merchant history
    if (table === "money_transactions" && op === "update")
      return { data: { id: TX_ID }, error: null };
    if (table === "money_categories")
      return {
        data: [
          { id: CAT_ID, name: "Transport", type: "expense", system_key: "transport" },
          { id: "66666666-6666-4666-8666-666666666666", name: "Other", type: "expense", system_key: "other" },
        ],
        error: null,
      };
    if (table === "expense_classification_rules") return { data: [], error: null };
    if (table === "money_ai_suggestions" && op === "insert")
      return { data: { id: SUGGESTION_ID }, error: null };
    if (table === "ai_requests" && op === "insert")
      return { data: { id: "req-1" }, error: null };
    return { data: null, error: null };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  executed = [];
  updatePayloads = {};
  insertPayloads = {};
});

describe("categorizeTransaction (rule-first pipeline)", () => {
  it("applies the user's saved rule directly and never calls AI", async () => {
    const supabase = makeSupabase(
      resolver({
        expense_classification_rules: () => ({
          data: [{ category_id: CAT_ID, expense_context_id: null, visibility: "private", owner_user_id: USER_ID }],
          error: null,
        }),
      }),
    );

    const result = await categorizeTransaction(supabase, ctx, TX_ID);

    expect(result).toEqual({ outcome: "rule_applied", categoryId: CAT_ID });
    expect(suggestCategoryWithAi).not.toHaveBeenCalled();
    const txUpdate = updatePayloads["money_transactions"]?.[0] as Record<string, unknown>;
    expect(txUpdate.category_id).toBe(CAT_ID);
    expect(txUpdate.category_source).toBe("rule");
    expect(txUpdate.categorization_status).toBe("confirmed");
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "money.transaction.categorized" }),
    );
  });

  it("suggests from merchant history before touching system rules or AI", async () => {
    const supabase = makeSupabase(
      resolver({
        money_transactions: (op, call) => {
          if (op === "select" && call === 1)
            return { data: [{ category_id: CAT_ID }, { category_id: CAT_ID }], error: null };
          return undefined;
        },
      }),
    );

    const result = await categorizeTransaction(supabase, ctx, TX_ID);

    expect(result).toMatchObject({ outcome: "suggested", source: "history", confidence: 0.85 });
    expect(suggestCategoryWithAi).not.toHaveBeenCalled();
    const suggestion = insertPayloads["money_ai_suggestions"]?.[0] as Record<string, unknown>;
    expect(suggestion.suggested_category_id).toBe(CAT_ID);
    expect(suggestion.source).toBe("history");
    // The transaction itself is only flipped to 'suggested' — never categorized.
    const statusUpdate = (updatePayloads["money_transactions"] ?? []).at(-1) as Record<string, unknown>;
    expect(statusUpdate.categorization_status).toBe("suggested");
    expect(statusUpdate.category_id).toBeUndefined();
  });

  it("falls back to a system keyword suggestion when history is empty", async () => {
    const supabase = makeSupabase(resolver());

    const result = await categorizeTransaction(supabase, ctx, TX_ID);

    // "bolt" matches the built-in transport pattern.
    expect(result).toMatchObject({ outcome: "suggested", source: "system" });
    expect(suggestCategoryWithAi).not.toHaveBeenCalled();
  });

  it("reports quota exhaustion when the ai_requests ledger rejects the call", async () => {
    const supabase = makeSupabase(
      resolver({
        money_transactions: (op, call) => {
          if (op === "select" && call === 0)
            return { data: { ...baseTx, title: "mystery payment", merchant_name: "Zzyzx 42" }, error: null };
          return undefined;
        },
        ai_requests: (op) => (op === "insert" ? { data: null, error: { message: "quota" } } : undefined),
      }),
    );

    const result = await categorizeTransaction(supabase, ctx, TX_ID);

    expect(result).toEqual({ outcome: "ai_quota_exceeded" });
    expect(suggestCategoryWithAi).not.toHaveBeenCalled();
    const statusUpdate = (updatePayloads["money_transactions"] ?? []).at(-1) as Record<string, unknown>;
    expect(statusUpdate.categorization_status).toBe("uncategorized");
  });

  it("marks the transaction failed when AI output is unusable, without throwing", async () => {
    suggestCategoryWithAi.mockResolvedValue({ ok: false, errorCode: "invalid_output", errorMessage: "bad json" });
    const supabase = makeSupabase(
      resolver({
        money_transactions: (op, call) => {
          if (op === "select" && call === 0)
            return { data: { ...baseTx, title: "mystery payment", merchant_name: "Zzyzx 42" }, error: null };
          return undefined;
        },
      }),
    );

    const result = await categorizeTransaction(supabase, ctx, TX_ID);

    expect(result).toEqual({ outcome: "ai_failed" });
    const statusUpdate = (updatePayloads["money_transactions"] ?? []).at(-1) as Record<string, unknown>;
    expect(statusUpdate.categorization_status).toBe("failed");
    // The quota row is flipped to failed, not left dangling.
    expect(updatePayloads["ai_requests"]?.[0]).toMatchObject({ status: "failed" });
  });

  it("creates an AI suggestion mapped onto the org taxonomy", async () => {
    suggestCategoryWithAi.mockResolvedValue({
      ok: true,
      suggestion: {
        category_name: "transport",
        type: "expense",
        merchant_name: "Zzyzx",
        confidence: 0.91,
        tags: ["one_off"],
        reasoning: "Looks like a ride-hailing charge.",
      },
      rawInput: { title: "mystery payment" },
      rawOutput: {},
    });
    const supabase = makeSupabase(
      resolver({
        money_transactions: (op, call) => {
          if (op === "select" && call === 0)
            return { data: { ...baseTx, title: "mystery payment", merchant_name: "Zzyzx 42" }, error: null };
          return undefined;
        },
      }),
    );

    const result = await categorizeTransaction(supabase, ctx, TX_ID);

    expect(result).toMatchObject({ outcome: "suggested", source: "ai", confidence: 0.91 });
    const suggestion = insertPayloads["money_ai_suggestions"]?.[0] as Record<string, unknown>;
    // Case-insensitive name match onto the org category.
    expect(suggestion.suggested_category_id).toBe(CAT_ID);
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "money.ai_suggestion.created" }),
    );
  });

  it("does not re-categorize an already confirmed transaction", async () => {
    const supabase = makeSupabase(
      resolver({
        money_transactions: (op, call) => {
          if (op === "select" && call === 0)
            return { data: { ...baseTx, category_id: CAT_ID, categorization_status: "confirmed" }, error: null };
          return undefined;
        },
      }),
    );

    const result = await categorizeTransaction(supabase, ctx, TX_ID);

    expect(result).toEqual({ outcome: "already_categorized" });
    expect(executed.filter((e) => e.includes("update"))).toHaveLength(0);
  });
});
