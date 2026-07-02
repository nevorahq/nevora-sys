import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const canDo = vi.fn();
const emitDomainEvent = vi.fn();
const emitAuditLog = vi.fn();
const revalidatePath = vi.fn();
const upsertPrivateMerchantRule = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
vi.mock("@/lib/context/current-context", () => ({ canDo }));
vi.mock("@/lib/events", () => ({ emitDomainEvent, emitAuditLog }));
vi.mock("../services/expense-classifier", () => ({
  CLASSIFIER_VERSION: "test",
  upsertPrivateMerchantRule,
}));

const { acceptMoneyAiSuggestionAction, rejectMoneyAiSuggestionAction } = await import(
  "./review-ai-suggestion.action"
);

const SUG_ID = "11111111-1111-4111-8111-111111111111";
const TX_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";
const CAT_ID = "55555555-5555-4555-8555-555555555555";

let updatePayloads: Record<string, unknown[]>;
let insertPayloads: Record<string, unknown[]>;

function makeSupabase(resolver: (table: string, op: string) => unknown) {
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
    for (const m of ["eq", "is", "in"]) builder[m] = vi.fn(() => builder);
    const term = () => Promise.resolve(resolver(table, state.op));
    builder.maybeSingle = vi.fn(term);
    builder.single = vi.fn(term);
    (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      term().then(res, rej);
    return builder;
  });
  return { from } as never;
}

const pendingSuggestion = {
  id: SUG_ID,
  transaction_id: TX_ID,
  suggested_category_id: CAT_ID,
  suggested_type: "expense",
  normalized_merchant_name: "google ireland",
  confidence: 0.94,
  source: "ai",
  status: "pending",
};

function infra(overrides: Partial<Record<string, unknown>> = {}) {
  return (table: string, op: string) => {
    if (table === "money_ai_suggestions" && op === "select")
      return overrides.suggestion ?? { data: pendingSuggestion, error: null };
    if (table === "money_categories")
      return overrides.category ?? { data: { id: CAT_ID, type: "expense" }, error: null };
    if (table === "money_transactions" && op === "update")
      return (
        overrides.txUpdate ?? {
          data: { id: TX_ID, visibility: "organization", owner_user_id: null, workspace_id: "ws" },
          error: null,
        }
      );
    return { data: null, error: null };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updatePayloads = {};
  insertPayloads = {};
  requireOrg.mockResolvedValue({ org: { id: ORG_ID }, workspace: { id: "ws" }, user: { id: USER_ID } });
  canDo.mockReturnValue(true);
  createClient.mockResolvedValue(makeSupabase(infra()));
});

describe("acceptMoneyAiSuggestionAction", () => {
  it("denies users without data.write", async () => {
    canDo.mockReturnValue(false);
    const result = await acceptMoneyAiSuggestionAction({ suggestionId: SUG_ID, rememberChoice: false });
    expect(result.error).toMatch(/permission/i);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("refuses to re-review an already reviewed suggestion", async () => {
    createClient.mockResolvedValue(
      makeSupabase(infra({ suggestion: { data: { ...pendingSuggestion, status: "accepted" }, error: null } })),
    );
    const result = await acceptMoneyAiSuggestionAction({ suggestionId: SUG_ID, rememberChoice: false });
    expect(result.error).toMatch(/already reviewed/i);
  });

  it("applies the suggested category and marks the suggestion accepted", async () => {
    const result = await acceptMoneyAiSuggestionAction({ suggestionId: SUG_ID, rememberChoice: false });

    expect(result.error).toBeUndefined();
    const txUpdate = updatePayloads["money_transactions"]?.[0] as Record<string, unknown>;
    expect(txUpdate).toMatchObject({
      category_id: CAT_ID,
      category_source: "ai",
      categorization_status: "confirmed",
    });
    const review = updatePayloads["money_ai_suggestions"]?.[0] as Record<string, unknown>;
    expect(review.status).toBe("accepted");
    expect(review.reviewed_by).toBe(USER_ID);
    expect(insertPayloads["transaction_classifications"]?.[0]).toMatchObject({ method: "ai" });
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "money.ai_suggestion.accepted" }),
    );
    expect(upsertPrivateMerchantRule).not.toHaveBeenCalled();
  });

  it("records an override as 'edited' with manual source and full confidence", async () => {
    const OVERRIDE = "66666666-6666-4666-8666-666666666666";
    createClient.mockResolvedValue(
      makeSupabase(infra({ category: { data: { id: OVERRIDE, type: "expense" }, error: null } })),
    );

    const result = await acceptMoneyAiSuggestionAction({
      suggestionId: SUG_ID,
      overrideCategoryId: OVERRIDE,
      rememberChoice: true,
    });

    expect(result.error).toBeUndefined();
    const txUpdate = updatePayloads["money_transactions"]?.[0] as Record<string, unknown>;
    expect(txUpdate).toMatchObject({ category_id: OVERRIDE, category_source: "manual", category_confidence: 1 });
    const review = updatePayloads["money_ai_suggestions"]?.[0] as Record<string, unknown>;
    expect(review.status).toBe("edited");
    // rememberChoice saves the caller's private merchant rule.
    expect(upsertPrivateMerchantRule).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ normalizedMerchant: "google ireland", categoryId: OVERRIDE }),
    );
  });

  it("rejects a category from another type/org", async () => {
    createClient.mockResolvedValue(makeSupabase(infra({ category: { data: null, error: null } })));
    const result = await acceptMoneyAiSuggestionAction({ suggestionId: SUG_ID, rememberChoice: false });
    expect(result.error).toMatch(/unavailable/i);
    expect(updatePayloads["money_transactions"]).toBeUndefined();
  });
});

describe("rejectMoneyAiSuggestionAction", () => {
  it("flips the suggestion to rejected and returns the transaction to the queue", async () => {
    const result = await rejectMoneyAiSuggestionAction({ suggestionId: SUG_ID });

    expect(result.error).toBeUndefined();
    const review = updatePayloads["money_ai_suggestions"]?.[0] as Record<string, unknown>;
    expect(review.status).toBe("rejected");
    const txUpdate = updatePayloads["money_transactions"]?.[0] as Record<string, unknown>;
    expect(txUpdate.categorization_status).toBe("uncategorized");
    // The transaction's category is never touched on reject.
    expect(txUpdate.category_id).toBeUndefined();
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "money.ai_suggestion.rejected" }),
    );
  });
});
