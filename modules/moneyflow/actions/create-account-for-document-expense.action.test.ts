import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const canDo = vi.fn();
const createMoneyAccount = vi.fn();
const findActiveMoneyAccountsByCurrency = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
vi.mock("@/lib/context/current-context", () => ({ canDo }));
vi.mock("../services/money-account-service", () => ({
  createMoneyAccount,
  findActiveMoneyAccountsByCurrency,
}));

const { createAccountForDocumentExpenseAction } = await import("./create-account-for-document-expense.action");

const TX_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const WORKSPACE_ID = "44444444-4444-4444-8444-444444444444";
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";
const DOCUMENT_ID = "66666666-6666-4666-8666-666666666666";

const ctx = { org: { id: ORG_ID }, workspace: { id: WORKSPACE_ID }, user: { id: USER_ID } };
let draftResult: unknown;

function makeForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("transactionId", overrides.transactionId ?? TX_ID);
  form.set("creationRequestId", overrides.creationRequestId ?? REQUEST_ID);
  form.set("name", overrides.name ?? "USD Account");
  form.set("type", overrides.type ?? "card");
  if (overrides.currency) form.set("currency", overrides.currency);
  return form;
}

function makeSupabase() {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "not", "is"]) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => draftResult);
  return { from: vi.fn(() => builder) };
}

beforeEach(() => {
  vi.clearAllMocks();
  draftResult = {
    data: { id: TX_ID, currency: "USD", source_document_id: DOCUMENT_ID },
    error: null,
  };
  requireOrg.mockResolvedValue(ctx);
  canDo.mockReturnValue(true);
  createClient.mockResolvedValue(makeSupabase());
  findActiveMoneyAccountsByCurrency.mockResolvedValue({ data: [], error: null });
  createMoneyAccount.mockResolvedValue({
    ok: true,
    created: true,
    account: { id: "account-1", name: "USD Account", currency: "USD" },
  });
});

describe("createAccountForDocumentExpenseAction", () => {
  it("rejects invalid IDs before loading organization context", async () => {
    const result = await createAccountForDocumentExpenseAction({}, makeForm({ transactionId: "bad" }));
    expect(result.fieldErrors?.transactionId).toBeDefined();
    expect(requireOrg).not.toHaveBeenCalled();
  });

  it("rejects a user without data.write", async () => {
    canDo.mockReturnValue(false);
    const result = await createAccountForDocumentExpenseAction({}, makeForm());
    expect(result.error).toMatch(/permission/i);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects a transaction that is not an active document draft", async () => {
    draftResult = { data: null, error: null };
    const result = await createAccountForDocumentExpenseAction({}, makeForm());
    expect(result.error).toMatch(/not found or already confirmed/i);
    expect(createMoneyAccount).not.toHaveBeenCalled();
  });

  it("reuses a compatible account that appeared in another tab", async () => {
    const account = { id: "account-existing", name: "Dollar Card", currency: "USD" };
    findActiveMoneyAccountsByCurrency.mockResolvedValue({ data: [account], error: null });

    await expect(createAccountForDocumentExpenseAction({}, makeForm())).resolves.toEqual({
      account,
      created: false,
    });
    expect(createMoneyAccount).not.toHaveBeenCalled();
  });

  it("derives currency from the draft and ignores a client currency override", async () => {
    const result = await createAccountForDocumentExpenseAction({}, makeForm({ currency: "MDL", name: "Dollar Wallet" }));

    expect(result).toMatchObject({ created: true, account: { currency: "USD" } });
    expect(createMoneyAccount).toHaveBeenCalledWith(
      expect.anything(),
      ctx,
      {
        name: "Dollar Wallet",
        type: "card",
        initialBalance: 0,
        currency: "USD",
        creationRequestId: REQUEST_ID,
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/documents/${DOCUMENT_ID}`);
  });

  it("returns a recoverable error when account creation fails", async () => {
    createMoneyAccount.mockResolvedValue({ ok: false, error: new Error("network") });
    const result = await createAccountForDocumentExpenseAction({}, makeForm());
    expect(result.error).toMatch(/could not be created/i);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
