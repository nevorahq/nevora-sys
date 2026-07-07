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
// Phase 2: actions now funnel through requireAppAccess; mock that boundary and
// delegate to the existing requireOrg fixture (the guard has its own tests).
vi.mock("@/lib/security", () => ({
  requireAppAccess: () => requireOrg(),
  accessErrorToActionResult: () => null,
  isAccessError: () => false,
}));
vi.mock("@/lib/context/current-context", () => ({ canDo }));
vi.mock("@/lib/events", () => ({ emitDomainEvent, emitAuditLog }));

const { rejectDocumentTransactionAction } = await import("./reject-document-transaction.action");

const TX_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const DOC_ID = "44444444-4444-4444-8444-444444444444";

let executed: string[];
let updatePayloads: Record<string, unknown>;

function makeSupabase(resolver: (table: string) => unknown) {
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    const result = () => {
      executed.push(`${table}:update`);
      return Promise.resolve(resolver(table));
    };
    builder.update = vi.fn((payload: Record<string, unknown>) => {
      updatePayloads[table] = payload;
      return builder;
    });
    builder.select = vi.fn(() => builder);
    builder.not = vi.fn(() => builder);
    for (const m of ["eq", "is", "in"]) builder[m] = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(result);
    (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      result().then(res, rej);
    return builder;
  });
  return { from } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  executed = [];
  updatePayloads = {};
  requireOrg.mockResolvedValue({ org: { id: ORG_ID }, workspace: { id: "ws" }, user: { id: USER_ID } });
  canDo.mockReturnValue(true);
  emitDomainEvent.mockResolvedValue(undefined);
  emitAuditLog.mockResolvedValue(undefined);
  createClient.mockResolvedValue(
    makeSupabase((table) => {
      if (table === "money_transactions") return { data: { id: TX_ID, source_document_id: DOC_ID }, error: null };
      return { error: null };
    }),
  );
});

describe("rejectDocumentTransactionAction", () => {
  it("rejects an invalid id before loading context", async () => {
    await expect(rejectDocumentTransactionAction("nope")).resolves.toEqual({ error: "Invalid transaction ID." });
    expect(requireOrg).not.toHaveBeenCalled();
  });

  it("rejects users without data.write permission", async () => {
    canDo.mockReturnValue(false);
    const result = await rejectDocumentTransactionAction(TX_ID);
    expect(result.error).toMatch(/permission/i);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("soft-deletes the planned draft, emits events, and dismisses the action item", async () => {
    const result = await rejectDocumentTransactionAction(TX_ID);

    expect(result).toEqual({});
    expect(updatePayloads.money_transactions).toMatchObject({ updated_by: USER_ID });
    expect(updatePayloads.money_transactions).toHaveProperty("deleted_at");
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "money.transaction.rejected", aggregateId: TX_ID }),
    );
    expect(updatePayloads.action_items).toMatchObject({ status: "dismissed" });
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/documents/${DOC_ID}`);
  });

  it("returns an error and skips events when no planned draft matched", async () => {
    createClient.mockResolvedValue(makeSupabase(() => ({ data: null, error: null })));
    const result = await rejectDocumentTransactionAction(TX_ID);
    expect(result.error).toMatch(/not found or already handled/i);
    expect(emitDomainEvent).not.toHaveBeenCalled();
    expect(executed).not.toContain("action_items:update");
  });
});
