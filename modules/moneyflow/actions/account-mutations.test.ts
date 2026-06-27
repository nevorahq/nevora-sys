import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireOrg: vi.fn(),
  canDo: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg: mocks.requireOrg }));
vi.mock("@/lib/context/current-context", () => ({ canDo: mocks.canDo }));
vi.mock("@/shared/i18n/get-dictionary", () => ({
  getDictionary: vi.fn(async () => ({
    dict: {
      money: {
        errors: {
          titleRequired: "Name required",
          invalidType: "Invalid type",
          updateAccountFailed: "Failed to update account",
          deactivateAccountFailed: "Failed to deactivate account",
          serverError: "Server error",
        },
      },
    },
  })),
}));

const { updateAccountAction } = await import("./update-account.action");
const { deactivateAccountAction } = await import("./deactivate-account.action");

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const ctx = { org: { id: ORG_ID }, user: { id: USER_ID } };

function makeUpdateForm() {
  const form = new FormData();
  form.set("accountId", ACCOUNT_ID);
  form.set("name", "Main USD Card");
  form.set("type", "card");
  form.set("initial_balance", "250.75");
  return form;
}

function makeMutationClient(result: { data: unknown; error: unknown }) {
  const filters: Array<[string, unknown]> = [];
  let payload: Record<string, unknown> | undefined;
  const builder: Record<string, unknown> = {};
  builder.update = vi.fn((value: Record<string, unknown>) => {
    payload = value;
    return builder;
  });
  builder.eq = vi.fn((field: string, value: unknown) => {
    filters.push([field, value]);
    return builder;
  });
  builder.is = vi.fn((field: string, value: unknown) => {
    filters.push([field, value]);
    return builder;
  });
  builder.select = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  return {
    supabase: { from: vi.fn(() => builder) },
    filters,
    getPayload: () => payload,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrg.mockResolvedValue(ctx);
  mocks.canDo.mockReturnValue(true);
});

describe("updateAccountAction", () => {
  it("updates only the current organization's non-deleted account", async () => {
    const db = makeMutationClient({ data: { id: ACCOUNT_ID }, error: null });
    mocks.createClient.mockResolvedValue(db.supabase);

    await expect(updateAccountAction({}, makeUpdateForm())).resolves.toEqual({});

    expect(db.getPayload()).toEqual({
      name: "Main USD Card",
      type: "card",
      initial_balance: 250.75,
      updated_by: USER_ID,
    });
    expect(db.filters).toEqual(expect.arrayContaining([
      ["id", ACCOUNT_ID],
      ["organization_id", ORG_ID],
      ["deleted_at", null],
    ]));
    expect(db.filters.some(([field]) => field === "user_id")).toBe(false);
  });

  it("returns an error when the account is outside the organization", async () => {
    const db = makeMutationClient({ data: null, error: null });
    mocks.createClient.mockResolvedValue(db.supabase);

    await expect(updateAccountAction({}, makeUpdateForm())).resolves.toEqual({
      error: "Failed to update account",
    });
  });

  it("rejects a non-numeric initial balance", async () => {
    const form = makeUpdateForm();
    form.set("initial_balance", "not-a-number");

    const result = await updateAccountAction({}, form);

    expect(result.fieldErrors?.initial_balance).toBeDefined();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe("deactivateAccountAction", () => {
  it("rejects an invalid account ID before loading context", async () => {
    await expect(deactivateAccountAction("bad-id")).resolves.toEqual({
      error: "Failed to deactivate account",
    });
    expect(mocks.requireOrg).not.toHaveBeenCalled();
  });

  it("deactivates only the current organization's non-deleted account", async () => {
    const db = makeMutationClient({ data: { id: ACCOUNT_ID }, error: null });
    mocks.createClient.mockResolvedValue(db.supabase);

    await expect(deactivateAccountAction(ACCOUNT_ID)).resolves.toEqual({});

    expect(db.getPayload()).toEqual({ is_active: false, updated_by: USER_ID });
    expect(db.filters).toEqual(expect.arrayContaining([
      ["id", ACCOUNT_ID],
      ["organization_id", ORG_ID],
      ["deleted_at", null],
    ]));
    expect(db.filters.some(([field]) => field === "user_id")).toBe(false);
  });

  it("does not mutate accounts without data.write permission", async () => {
    mocks.canDo.mockReturnValue(false);

    await expect(deactivateAccountAction(ACCOUNT_ID)).resolves.toEqual({
      error: "Failed to deactivate account",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
