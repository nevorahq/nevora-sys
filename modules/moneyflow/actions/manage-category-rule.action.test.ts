import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const canDo = vi.fn();
const isAdmin = vi.fn();
const emitDomainEvent = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
vi.mock("@/lib/context/current-context", () => ({ canDo, isAdmin }));
vi.mock("@/lib/events", () => ({ emitDomainEvent }));

const { updateCategoryRuleAction, deleteCategoryRuleAction } = await import(
  "./manage-category-rule.action"
);

const RULE_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_USER = "99999999-9999-4999-8999-999999999999";

let updatePayloads: unknown[];
let deletes: number;

function makeSupabase(rule: Record<string, unknown> | null) {
  const from = vi.fn((table: string) => {
    const state = { op: "select" };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.update = vi.fn((payload: unknown) => {
      state.op = "update";
      updatePayloads.push(payload);
      return builder;
    });
    builder.delete = vi.fn(() => {
      state.op = "delete";
      deletes += 1;
      return builder;
    });
    for (const m of ["eq", "is"]) builder[m] = vi.fn(() => builder);
    const term = () =>
      Promise.resolve(
        table === "expense_classification_rules" && state.op === "select"
          ? { data: rule, error: null }
          : table === "money_categories"
            ? { data: { id: "cat" }, error: null }
            : { data: null, error: null },
      );
    builder.maybeSingle = vi.fn(term);
    (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      term().then(res, rej);
    return builder;
  });
  return { from } as never;
}

const ownPrivateRule = {
  id: RULE_ID,
  visibility: "private",
  owner_user_id: USER_ID,
  category_id: "cat-old",
  is_active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  updatePayloads = [];
  deletes = 0;
  requireOrg.mockResolvedValue({ org: { id: ORG_ID }, workspace: { id: "ws" }, user: { id: USER_ID } });
  canDo.mockReturnValue(true);
  isAdmin.mockReturnValue(false);
  createClient.mockResolvedValue(makeSupabase(ownPrivateRule));
});

describe("updateCategoryRuleAction", () => {
  it("validates payloads", async () => {
    const result = await updateCategoryRuleAction({ ruleId: "nope", isActive: false });
    expect(result.error).toBeTruthy();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("blocks managing another user's private rule", async () => {
    createClient.mockResolvedValue(
      makeSupabase({ ...ownPrivateRule, owner_user_id: OTHER_USER }),
    );
    const result = await updateCategoryRuleAction({ ruleId: RULE_ID, isActive: false });
    expect(result.error).toMatch(/own private rules/i);
    expect(updatePayloads).toHaveLength(0);
  });

  it("blocks org-rule management for non-admins and allows it for admins", async () => {
    createClient.mockResolvedValue(
      makeSupabase({ ...ownPrivateRule, visibility: "organization", owner_user_id: null }),
    );
    const denied = await updateCategoryRuleAction({ ruleId: RULE_ID, isActive: false });
    expect(denied.error).toMatch(/owner or admin/i);

    isAdmin.mockReturnValue(true);
    const allowed = await updateCategoryRuleAction({ ruleId: RULE_ID, isActive: false });
    expect(allowed.error).toBeUndefined();
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "money.category_rule.disabled" }),
    );
  });

  it("emits enabled/updated events matching the change", async () => {
    createClient.mockResolvedValue(makeSupabase({ ...ownPrivateRule, is_active: false }));
    await updateCategoryRuleAction({ ruleId: RULE_ID, isActive: true });
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "money.category_rule.enabled" }),
    );

    emitDomainEvent.mockClear();
    createClient.mockResolvedValue(makeSupabase(ownPrivateRule));
    await updateCategoryRuleAction({ ruleId: RULE_ID, priority: 200 });
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "money.category_rule.updated" }),
    );
  });
});

describe("deleteCategoryRuleAction", () => {
  it("requires data.delete", async () => {
    canDo.mockReturnValue(false);
    const result = await deleteCategoryRuleAction({ ruleId: RULE_ID });
    expect(result.error).toMatch(/permission/i);
    expect(deletes).toBe(0);
  });

  it("deletes the caller's own rule and emits the event", async () => {
    const result = await deleteCategoryRuleAction({ ruleId: RULE_ID });
    expect(result.error).toBeUndefined();
    expect(deletes).toBe(1);
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "money.category_rule.deleted" }),
    );
  });
});
