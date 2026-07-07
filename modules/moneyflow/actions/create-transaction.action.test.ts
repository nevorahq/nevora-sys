import { beforeEach, describe, expect, it, vi } from "vitest";

const after = vi.fn();
const revalidatePath = vi.fn();
const createClient = vi.fn();
const requireOrg = vi.fn();
const emitDomainEvent = vi.fn();
const reserveOrganizationUsage = vi.fn();
const releaseOrganizationUsage = vi.fn();
const categorizeTransaction = vi.fn();

vi.mock("next/server", () => ({ after }));
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
vi.mock("@/lib/events", () => ({ emitDomainEvent }));
vi.mock("@/modules/billing", () => ({
  reserveOrganizationUsage,
  releaseOrganizationUsage,
}));
vi.mock("../services/money-categorization.service", () => ({ categorizeTransaction }));
vi.mock("@/shared/i18n/get-dictionary", () => ({
  getDictionary: async () => ({ dict: { money: { errors: {} } } }),
}));
vi.mock("../schemas/transaction.schema", () => ({
  getTransactionSchemas: () => ({
    createTransactionSchema: {
      safeParse: (raw: Record<string, unknown>) => ({
        success: true,
        data: {
          title: raw.title,
          type: raw.type,
          amount: Number(raw.amount),
          account_id: raw.account_id,
          category_id: raw.category_id ?? null,
          subscription_id: raw.subscription_id ?? null,
          status: raw.status ?? "posted",
          transaction_date: raw.transaction_date ?? "2026-07-02",
          currency: "EUR",
          note: raw.note ?? null,
        },
      }),
    },
  }),
}));

const { createTransactionAction } = await import("./create-transaction.action");

const TX_ID = "11111111-1111-4111-8111-111111111111";
const CAT_ID = "44444444-4444-4444-8444-444444444444";

let insertPayload: Record<string, unknown> | undefined;

function makeSupabase() {
  const from = vi.fn(() => {
    const builder: Record<string, unknown> = {};
    builder.insert = vi.fn((payload: Record<string, unknown>) => {
      insertPayload = payload;
      return builder;
    });
    builder.select = vi.fn(() => builder);
    builder.single = vi.fn(async () => ({ data: { id: TX_ID }, error: null }));
    return builder;
  });
  return { from } as never;
}

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  insertPayload = undefined;
  requireOrg.mockResolvedValue({
    user: { id: "user-1" },
    org: { id: "org-1" },
    workspace: { id: "ws-1" },
  });
  reserveOrganizationUsage.mockResolvedValue(1);
  releaseOrganizationUsage.mockResolvedValue(0);
  createClient.mockResolvedValue(makeSupabase());
  categorizeTransaction.mockResolvedValue({ outcome: "suggested" });
});

const baseFields = { title: "Coffee", type: "expense", amount: "4.5", account_id: "acc-1" };

describe("createTransactionAction auto-categorization (Phase 5.1)", () => {
  it("schedules the pipeline after the response for an uncategorized posted transaction", async () => {
    const result = await createTransactionAction({}, formData(baseFields));

    expect(result.error).toBeUndefined();
    expect(insertPayload).toMatchObject({ categorization_status: "uncategorized", category_source: null });
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "money.transaction.auto_categorization_requested",
        aggregateId: TX_ID,
      }),
    );
    expect(after).toHaveBeenCalledTimes(1);

    // Run the captured background callback: it must invoke the full pipeline
    // (AI allowed — it is off the critical path here).
    await (after.mock.calls[0][0] as () => Promise<void>)();
    expect(categorizeTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      TX_ID,
      { allowAi: true },
    );
  });

  it("does not trigger the pipeline when the user picked a category", async () => {
    await createTransactionAction({}, formData({ ...baseFields, category_id: CAT_ID }));

    expect(insertPayload).toMatchObject({ category_id: CAT_ID, categorization_status: "confirmed", category_source: "manual" });
    expect(after).not.toHaveBeenCalled();
    expect(emitDomainEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "money.transaction.auto_categorization_requested" }),
    );
  });

  it("does not trigger the pipeline for planned drafts", async () => {
    await createTransactionAction({}, formData({ ...baseFields, status: "planned" }));
    expect(after).not.toHaveBeenCalled();
  });

  it("a slow or failing pipeline never breaks transaction creation", async () => {
    categorizeTransaction.mockRejectedValue(new Error("provider down"));
    const result = await createTransactionAction({}, formData(baseFields));
    expect(result.error).toBeUndefined();
    // The background callback swallows its own failure.
    await expect(
      (after.mock.calls[0][0] as () => Promise<void>)(),
    ).resolves.toBeUndefined();
  });
});

describe("createTransactionAction reservation compensation (P1-3)", () => {
  it("releases the reservation when an unexpected error occurs before the insert commits", async () => {
    // Throw between a successful reserve and a committed row.
    createClient.mockRejectedValueOnce(new Error("connection refused"));

    await createTransactionAction({}, formData(baseFields));

    expect(reserveOrganizationUsage).toHaveBeenCalledWith("org-1", "money_transactions.count", 1);
    expect(releaseOrganizationUsage).toHaveBeenCalledWith("org-1", "money_transactions.count", 1);
    expect(releaseOrganizationUsage).toHaveBeenCalledTimes(1);
  });

  it("does NOT release when a post-insert step throws (the row already backs the count)", async () => {
    // Insert succeeds; a later side effect throws. The counter is legitimate.
    emitDomainEvent.mockRejectedValueOnce(new Error("event bus down"));

    await createTransactionAction({}, formData(baseFields));

    expect(reserveOrganizationUsage).toHaveBeenCalledTimes(1);
    expect(releaseOrganizationUsage).not.toHaveBeenCalled();
  });
});
