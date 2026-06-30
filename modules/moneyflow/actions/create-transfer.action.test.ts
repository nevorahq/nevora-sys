import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const emitDomainEvent = vi.fn();
const checkPlanLimit = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
vi.mock("@/lib/events", () => ({ emitDomainEvent }));
vi.mock("@/lib/billing", () => ({ checkPlanLimit }));
vi.mock("@/shared/i18n/get-dictionary", () => ({
  getDictionary: vi.fn(async () => ({
    dict: {
      money: {
        errors: {
          amountRequired: "Amount is required",
          amountPositive: "Amount must be greater than 0",
          accountRequired: "Account is required",
          invalidDate: "Invalid date",
          fromAccountRequired: "Source account is required",
          toAccountRequired: "Destination account is required",
          sameAccount: "Choose a different destination account.",
          transferCurrencyMismatch:
            "Transfer is available only between accounts with the same currency.",
          createTransferFailed: "Failed to create transfer",
          serverError: "Server error",
        },
      },
    },
  })),
}));

const { createTransferAction } = await import("./create-transfer.action");

const FROM = "11111111-1111-4111-8111-111111111111";
const TO = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";
const WORKSPACE_ID = "55555555-5555-4555-8555-555555555555";
const NEW_TX = "66666666-6666-4666-8666-666666666666";

const ctx = { org: { id: ORG_ID }, workspace: { id: WORKSPACE_ID }, user: { id: USER_ID } };

function makeForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("from_account_id", overrides.from_account_id ?? FROM);
  form.set("to_account_id", overrides.to_account_id ?? TO);
  form.set("amount", overrides.amount ?? "300");
  if (overrides.transaction_date) form.set("transaction_date", overrides.transaction_date);
  if (overrides.note) form.set("note", overrides.note);
  return form;
}

/**
 * Supabase mock: the accounts lookup (.in) resolves `accountsData`, and the
 * insert(...).select().single() resolves `insertResult`. `insertArg` captures
 * the inserted row so we can assert the transfer shape.
 */
let accountsData: unknown;
let insertResult: unknown;
let insertArg: Record<string, unknown> | null;

function makeSupabase() {
  const insertBuilder = {
    select: vi.fn(() => insertBuilder),
    single: vi.fn(async () => insertResult),
  };
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.is = vi.fn(() => builder);
  builder.in = vi.fn(async () => accountsData);
  builder.insert = vi.fn((row: Record<string, unknown>) => {
    insertArg = row;
    return insertBuilder;
  });
  return { from: vi.fn(() => builder) };
}

beforeEach(() => {
  vi.clearAllMocks();
  insertArg = null;
  requireOrg.mockResolvedValue(ctx);
  checkPlanLimit.mockResolvedValue({ allowed: true });
  emitDomainEvent.mockResolvedValue(undefined);
  accountsData = {
    data: [
      { id: FROM, name: "Cash", currency: "EUR", is_active: true },
      { id: TO, name: "Bank", currency: "EUR", is_active: true },
    ],
    error: null,
  };
  insertResult = { data: { id: NEW_TX }, error: null };
  createClient.mockResolvedValue(makeSupabase());
});

describe("createTransferAction", () => {
  it("creates a single type='transfer' row with from/to and source currency", async () => {
    const result = await createTransferAction({}, makeForm());

    expect(result).toEqual({});
    expect(insertArg).toMatchObject({
      type: "transfer",
      account_id: FROM,
      from_account_id: FROM,
      to_account_id: TO,
      category_id: null,
      amount: 300,
      currency: "EUR",
      status: "posted",
      title: "Cash → Bank",
    });
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "money.transfer.created" }),
    );
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("rejects a transfer to the same account", async () => {
    const result = await createTransferAction({}, makeForm({ to_account_id: FROM }));

    expect(result.fieldErrors?.to_account_id?.[0]).toBe("Choose a different destination account.");
    expect(insertArg).toBeNull();
  });

  it("rejects a non-positive amount", async () => {
    const result = await createTransferAction({}, makeForm({ amount: "0" }));

    expect(result.fieldErrors?.amount?.[0]).toBe("Amount must be greater than 0");
    expect(insertArg).toBeNull();
  });

  it("rejects a transfer between different currencies", async () => {
    accountsData = {
      data: [
        { id: FROM, name: "Cash", currency: "EUR", is_active: true },
        { id: TO, name: "USD Bank", currency: "USD", is_active: true },
      ],
      error: null,
    };
    createClient.mockResolvedValue(makeSupabase());

    const result = await createTransferAction({}, makeForm());

    expect(result.fieldErrors?.to_account_id?.[0]).toBe(
      "Transfer is available only between accounts with the same currency.",
    );
    expect(insertArg).toBeNull();
  });
});
