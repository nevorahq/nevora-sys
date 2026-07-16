import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireAppAccess = vi.fn();
const emitDomainEvent = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/security", () => ({
  requireAppAccess,
  accessErrorToActionResult: () => null,
}));
vi.mock("@/lib/events", () => ({ emitDomainEvent }));
vi.mock("@/shared/i18n/get-dictionary", () => ({
  getDictionary: vi.fn(async () => ({
    dict: {
      money: {
        errors: { invalidDate: "Invalid date" },
        exchangeRates: {
          errors: {
            currencyRequired: "Choose currency",
            ratePositive: "Positive rate required",
            sameCurrency: "Different currency required",
            correctionConfirmation: "Confirm correction",
            unusualConfirmation: "Confirm unusual rate",
            providerConflict: "Provider conflict",
            adminOnly: "Admin only",
            saveFailed: "Save failed",
          },
        },
      },
    },
  })),
}));

const { saveExchangeRateAction } = await import("./save-exchange-rate.action");

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const WORKSPACE = "33333333-3333-4333-8333-333333333333";
const RATE_ID = "44444444-4444-4444-8444-444444444444";

let lookupResult: unknown;
let referenceResult: unknown;
let insertPayload: Record<string, unknown> | null;
let updatePayload: Record<string, unknown> | null;

function makeClient() {
  const lookup: Record<string, unknown> = {};
  lookup.select = vi.fn(() => lookup);
  lookup.eq = vi.fn(() => lookup);
  lookup.maybeSingle = vi.fn(async () => lookupResult);

  const insertBuilder = {
    select: vi.fn(() => insertBuilder),
    single: vi.fn(async () => ({ data: { id: RATE_ID }, error: null })),
  };
  const updateBuilder: Record<string, unknown> = {};
  updateBuilder.eq = vi.fn(() => updateBuilder);
  (updateBuilder as { then: unknown }).then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ error: null }).then(resolve);

  return {
    rpc: vi.fn(async () => referenceResult),
    from: vi.fn(() => ({
      ...lookup,
      insert: vi.fn((payload: Record<string, unknown>) => {
        insertPayload = payload;
        return insertBuilder;
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        updatePayload = payload;
        return updateBuilder;
      }),
    })),
  };
}

function form(options: { correction?: boolean; unusual?: boolean; rate?: string } = {}) {
  const data = new FormData();
  data.set("quote_currency", "eur");
  data.set("rate", options.rate ?? "20,2");
  data.set("effective_date", "2026-07-10");
  if (options.correction) data.set("confirm_correction", "yes");
  if (options.unusual) data.set("confirm_unusual", "yes");
  return data;
}

const ownerContext = {
  org: { id: ORG, baseCurrency: "MDL" },
  user: { id: USER },
  workspace: { id: WORKSPACE },
  role: { id: "owner", name: "owner", isSystem: true, organizationId: ORG },
};

beforeEach(() => {
  vi.clearAllMocks();
  insertPayload = null;
  updatePayload = null;
  lookupResult = { data: null, error: null };
  referenceResult = { data: "20.0", error: null };
  requireAppAccess.mockResolvedValue(ownerContext);
  createClient.mockResolvedValue(makeClient());
  emitDomainEvent.mockResolvedValue(undefined);
});

describe("saveExchangeRateAction", () => {
  it("keeps non-admin members read-only", async () => {
    requireAppAccess.mockResolvedValue({
      ...ownerContext,
      role: { id: "member", name: "member", isSystem: true, organizationId: ORG },
    });

    await expect(saveExchangeRateAction({}, form())).resolves.toEqual({ error: "Admin only" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("creates a dated manual rate for an owner/admin", async () => {
    await expect(saveExchangeRateAction({}, form())).resolves.toEqual({});

    expect(insertPayload).toMatchObject({
      organization_id: ORG,
      base_currency: "MDL",
      quote_currency: "EUR",
      rate: "0.0495049505",
      effective_date: "2026-07-10",
      source: "manual",
      created_by: USER,
      updated_by: USER,
    });
    expect(emitDomainEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventName: "money.exchange_rate.created",
    }));
  });

  it("requires confirmation for a factor-of-ten deviation from the reference", async () => {
    const result = await saveExchangeRateAction({}, form({ rate: "2,02" }));

    expect(result.fieldErrors?.rate?.[0]).toBe("Confirm unusual rate");
    expect(insertPayload).toBeNull();
  });

  it("allows an explicitly confirmed unusual business rate", async () => {
    await expect(saveExchangeRateAction({}, form({ rate: "2,02", unusual: true }))).resolves.toEqual({});

    expect(insertPayload).toMatchObject({ rate: "0.4950495050" });
  });

  it("requires explicit confirmation before correcting the same date", async () => {
    lookupResult = { data: { id: RATE_ID, rate: "0.05", source: "manual", provider: null }, error: null };
    createClient.mockResolvedValue(makeClient());

    const result = await saveExchangeRateAction({}, form());

    expect(result.fieldErrors?.rate?.[0]).toBe("Confirm correction");
    expect(updatePayload).toBeNull();
  });

  it("emits old and new values for a confirmed same-date correction", async () => {
    lookupResult = { data: { id: RATE_ID, rate: "0.05", source: "manual", provider: null }, error: null };
    createClient.mockResolvedValue(makeClient());

    await expect(saveExchangeRateAction({}, form({ correction: true }))).resolves.toEqual({});

    expect(updatePayload).toMatchObject({ rate: "0.0495049505", updated_by: USER });
    expect(emitDomainEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventName: "money.exchange_rate.updated",
    }));
  });
});
