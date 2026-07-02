import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const canDo = vi.fn();
const isAdmin = vi.fn();
const emitDomainEvent = vi.fn();
const revalidatePath = vi.fn();
const upsertPrivateMerchantRule = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
vi.mock("@/lib/context/current-context", () => ({ canDo, isAdmin }));
vi.mock("@/lib/events", () => ({ emitDomainEvent }));
vi.mock("../services/expense-classifier", () => ({
  normalizeMerchantName: (value: string | null | undefined) =>
    (value ?? "").toLowerCase().trim(),
  upsertPrivateMerchantRule,
}));

const { createCategoryRuleAction } = await import("./create-category-rule.action");

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const CAT_ID = "44444444-4444-4444-8444-444444444444";

let insertPayloads: Record<string, unknown[]>;
let updatePayloads: Record<string, unknown[]>;

function makeSupabase(resolver: (table: string, op: string) => unknown) {
  const from = vi.fn((table: string) => {
    const state = { op: "select" };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.insert = vi.fn((payload: Record<string, unknown>) => {
      state.op = "insert";
      (insertPayloads[table] ??= []).push(payload);
      return builder;
    });
    builder.update = vi.fn((payload: Record<string, unknown>) => {
      state.op = "update";
      (updatePayloads[table] ??= []).push(payload);
      return builder;
    });
    for (const m of ["eq", "is"]) builder[m] = vi.fn(() => builder);
    const term = () => Promise.resolve(resolver(table, state.op));
    builder.maybeSingle = vi.fn(term);
    (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      term().then(res, rej);
    return builder;
  });
  return { from } as never;
}

function infra(overrides: Partial<Record<string, unknown>> = {}) {
  return (table: string, op: string) => {
    if (table === "money_categories") return overrides.category ?? { data: { id: CAT_ID }, error: null };
    if (table === "expense_classification_rules" && op === "select")
      return overrides.existingRule ?? { data: null, error: null };
    if (table === "expense_classification_rules" && (op === "insert" || op === "update"))
      return overrides.savedRule ?? { data: { id: "org-rule-1" }, error: null };
    return { data: null, error: null };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  insertPayloads = {};
  updatePayloads = {};
  requireOrg.mockResolvedValue({ org: { id: ORG_ID }, workspace: { id: "ws" }, user: { id: USER_ID } });
  canDo.mockReturnValue(true);
  isAdmin.mockReturnValue(false);
  upsertPrivateMerchantRule.mockResolvedValue("private-rule-1");
  createClient.mockResolvedValue(makeSupabase(infra()));
});

describe("createCategoryRuleAction", () => {
  it("rejects malformed payloads before touching the database", async () => {
    const result = await createCategoryRuleAction({ merchant: "g", categoryId: "not-a-uuid" });
    expect(result.error).toBeTruthy();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("denies organization-wide rules to non-admins", async () => {
    const result = await createCategoryRuleAction({
      merchant: "google",
      categoryId: CAT_ID,
      scope: "organization",
    });
    expect(result.error).toMatch(/owner or admin/i);
    expect(createClient).not.toHaveBeenCalled();
    expect(upsertPrivateMerchantRule).not.toHaveBeenCalled();
  });

  it("creates a private rule by default via the existing upsert path", async () => {
    const result = await createCategoryRuleAction({ merchant: "Google Ireland", categoryId: CAT_ID });
    expect(result.error).toBeUndefined();
    expect(upsertPrivateMerchantRule).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ normalizedMerchant: "google ireland", categoryId: CAT_ID }),
    );
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "money.category_rule.created",
        aggregateId: "private-rule-1",
        payload: expect.objectContaining({ rule_id: "private-rule-1", scope: "private" }),
      }),
    );
  });

  it("lets an admin create an organization-wide rule with owner_user_id NULL", async () => {
    isAdmin.mockReturnValue(true);
    const result = await createCategoryRuleAction({
      merchant: "google",
      categoryId: CAT_ID,
      scope: "organization",
    });
    expect(result.error).toBeUndefined();
    const inserted = insertPayloads["expense_classification_rules"]?.[0] as Record<string, unknown>;
    expect(inserted).toMatchObject({
      visibility: "organization",
      owner_user_id: null,
      normalized_merchant: "google",
      category_id: CAT_ID,
      created_by: USER_ID,
    });
    expect(upsertPrivateMerchantRule).not.toHaveBeenCalled();
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "money.category_rule.created",
        aggregateId: "org-rule-1",
        payload: expect.objectContaining({ rule_id: "org-rule-1", scope: "organization" }),
      }),
    );
  });

  it("refreshes an existing org rule instead of duplicating it", async () => {
    isAdmin.mockReturnValue(true);
    createClient.mockResolvedValue(
      makeSupabase(infra({ existingRule: { data: { id: "rule-1" }, error: null } })),
    );
    const result = await createCategoryRuleAction({
      merchant: "google",
      categoryId: CAT_ID,
      scope: "organization",
    });
    expect(result.error).toBeUndefined();
    expect(insertPayloads["expense_classification_rules"]).toBeUndefined();
    expect(updatePayloads["expense_classification_rules"]?.[0]).toMatchObject({ category_id: CAT_ID });
  });
});
