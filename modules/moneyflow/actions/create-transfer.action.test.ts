import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const emitDomainEvent = vi.fn();
const reserveOrganizationUsage = vi.fn();
const releaseOrganizationUsage = vi.fn();
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
vi.mock("@/lib/events", () => ({ emitDomainEvent }));
vi.mock("@/modules/billing", () => ({ reserveOrganizationUsage, releaseOrganizationUsage }));
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
          transferRateMissing: "No rate. Enter destination amount.",
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
  if (overrides.destination_amount) form.set("destination_amount", overrides.destination_amount);
  if (overrides.use_custom_destination) form.set("use_custom_destination", overrides.use_custom_destination);
  if (overrides.transaction_date) form.set("transaction_date", overrides.transaction_date);
  if (overrides.note) form.set("note", overrides.note);
  return form;
}

/**
 * Supabase mock: the authoritative transfer RPC returns the financial snapshot.
 */
let rpcResult: unknown;
let rpcArgs: Record<string, unknown> | null;

function makeSupabase() {
  const rpcBuilder = {
    single: vi.fn(async () => rpcResult),
  };
  return {
    rpc: vi.fn((_name: string, args: Record<string, unknown>) => {
      rpcArgs = args;
      return rpcBuilder;
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcArgs = null;
  requireOrg.mockResolvedValue(ctx);
  reserveOrganizationUsage.mockResolvedValue(1);
  releaseOrganizationUsage.mockResolvedValue(0);
  emitDomainEvent.mockResolvedValue(undefined);
  rpcResult = {
    data: {
      id: NEW_TX,
      source_amount: "300.00",
      source_currency: "EUR",
      destination_amount: "300.00",
      destination_currency: "EUR",
      reference_exchange_rate: "1",
      effective_exchange_rate: "1",
      exchange_rate_source: null,
      exchange_rate_id: null,
    },
    error: null,
  };
  createClient.mockResolvedValue(makeSupabase());
});

describe("createTransferAction", () => {
  it("creates a single type='transfer' row with from/to and source currency", async () => {
    const result = await createTransferAction({}, makeForm());

    expect(result).toEqual({});
    expect(rpcArgs).toMatchObject({
      p_organization_id: ORG_ID,
      p_from_account_id: FROM,
      p_to_account_id: TO,
      p_source_amount: "300",
      p_destination_amount: null,
    });
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "money.transfer.created",
        payload: expect.objectContaining({
          source_amount: 300,
          source_currency: "EUR",
          destination_amount: 300,
          destination_currency: "EUR",
          effective_exchange_rate: 1,
        }),
      }),
    );
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("rejects a transfer to the same account", async () => {
    const result = await createTransferAction({}, makeForm({ to_account_id: FROM }));

    expect(result.fieldErrors?.to_account_id?.[0]).toBe("Choose a different destination account.");
    expect(rpcArgs).toBeNull();
  });

  it("rejects a non-positive amount", async () => {
    const result = await createTransferAction({}, makeForm({ amount: "0" }));

    expect(result.fieldErrors?.amount?.[0]).toBe("Amount must be greater than 0");
    expect(rpcArgs).toBeNull();
  });

  it("lets the DB calculate 100 EUR → USD instead of trusting the preview", async () => {
    rpcResult = {
      data: {
        id: NEW_TX,
        source_amount: "100.00",
        source_currency: "EUR",
        destination_amount: "108.45",
        destination_currency: "USD",
        reference_exchange_rate: "1.0845",
        effective_exchange_rate: "1.0845",
        exchange_rate_source: "manual",
        exchange_rate_id: "77777777-7777-4777-8777-777777777777",
      },
      error: null,
    };
    createClient.mockResolvedValue(makeSupabase());

    const result = await createTransferAction({}, makeForm({
      amount: "100",
      destination_amount: "108.45",
    }));

    expect(result).toEqual({});
    expect(rpcArgs).toMatchObject({
      p_source_amount: "100",
      p_destination_amount: null,
    });
    expect(emitDomainEvent).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        source_amount: 100,
        destination_amount: 108.45,
        reference_exchange_rate: 1.0845,
        exchange_rate_source: "manual",
      }),
    }));
  });

  it("passes an actual credited amount only after an explicit custom override", async () => {
    rpcResult = {
      data: {
        id: NEW_TX,
        source_amount: "100.00",
        source_currency: "EUR",
        destination_amount: "107.00",
        destination_currency: "USD",
        reference_exchange_rate: "1.0845",
        effective_exchange_rate: "1.07",
        exchange_rate_source: "manual",
        exchange_rate_id: "77777777-7777-4777-8777-777777777777",
      },
      error: null,
    };
    createClient.mockResolvedValue(makeSupabase());

    const result = await createTransferAction({}, makeForm({
      amount: "100",
      destination_amount: "107.00",
      use_custom_destination: "yes",
    }));

    expect(result).toEqual({});
    expect(rpcArgs).toMatchObject({ p_destination_amount: "107.00" });
  });

  it("surfaces a missing reference rate without falling back to 1:1", async () => {
    rpcResult = { data: null, error: { message: "missing_exchange_rate" } };
    createClient.mockResolvedValue(makeSupabase());

    const result = await createTransferAction({}, makeForm({ amount: "100" }));

    expect(result.fieldErrors?.destination_amount?.[0]).toBe("No rate. Enter destination amount.");
    expect(releaseOrganizationUsage).toHaveBeenCalled();
  });
});
