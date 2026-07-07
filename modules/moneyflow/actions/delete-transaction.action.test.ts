import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const canDo = vi.fn();
const emitDomainEvent = vi.fn();
const getDictionary = vi.fn();
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
vi.mock("@/lib/events", () => ({ emitDomainEvent }));
vi.mock("@/shared/i18n/get-dictionary", () => ({ getDictionary }));

const { deleteTransactionAction } = await import("./delete-transaction.action");

const TRANSACTION_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8332-333333333333";

const maybeSingle = vi.fn();
const select = vi.fn(() => ({ maybeSingle }));
const organizationEq = vi.fn(() => ({ select }));
const transactionEq = vi.fn(() => ({ eq: organizationEq }));
const deleteQuery = vi.fn(() => ({ eq: transactionEq }));
const from = vi.fn(() => ({ delete: deleteQuery }));
const rpc = vi.fn(async () => ({ error: null }));

beforeEach(() => {
  vi.clearAllMocks();
  getDictionary.mockResolvedValue({
    dict: {
      money: {
        errors: {
          deleteTransactionFailed: "Failed to delete transaction",
          serverError: "Server error",
        },
      },
    },
  });
  requireOrg.mockResolvedValue({
    user: { id: USER_ID },
    org: { id: ORGANIZATION_ID },
    workspace: { id: "44444444-4444-4444-8444-444444444444" },
    permissions: new Set(["data.delete"]),
  });
  canDo.mockReturnValue(true);
  createClient.mockResolvedValue({ from, rpc });
  emitDomainEvent.mockResolvedValue(undefined);
  maybeSingle.mockResolvedValue({
    data: {
      id: TRANSACTION_ID,
      workspace_id: null,
      amount: "42.50",
      type: "expense",
    },
    error: null,
  });
});

describe("deleteTransactionAction", () => {
  it("rejects an invalid transaction id before loading organization context", async () => {
    await expect(deleteTransactionAction("not-a-uuid")).resolves.toEqual({
      error: "Failed to delete transaction",
    });
    expect(requireOrg).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects users without data.delete permission before querying Supabase", async () => {
    canDo.mockReturnValue(false);

    await expect(deleteTransactionAction(TRANSACTION_ID)).resolves.toEqual({
      error: "Failed to delete transaction",
    });
    expect(canDo).toHaveBeenCalledWith(expect.objectContaining({ org: { id: ORGANIZATION_ID } }), "data.delete");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("deletes only inside the active organization and records the domain event", async () => {
    await expect(deleteTransactionAction(TRANSACTION_ID)).resolves.toEqual({});

    expect(from).toHaveBeenCalledWith("money_transactions");
    expect(transactionEq).toHaveBeenCalledWith("id", TRANSACTION_ID);
    expect(organizationEq).toHaveBeenCalledWith("organization_id", ORGANIZATION_ID);
    expect(select).toHaveBeenCalledWith("id, workspace_id, amount, type");
    expect(emitDomainEvent).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      workspaceId: undefined,
      eventName: "transaction.deleted",
      aggregateType: "transaction",
      aggregateId: TRANSACTION_ID,
      payload: { amount: 42.5, type: "expense" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/money");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    // Purges the deleted transaction's Action Center + notification footprint.
    expect(rpc).toHaveBeenCalledWith("purge_transaction_from_action_center", {
      p_organization_id: ORGANIZATION_ID,
      p_transaction_id: TRANSACTION_ID,
    });
  });

  it("returns an error when the delete matched no row", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(deleteTransactionAction(TRANSACTION_ID)).resolves.toEqual({
      error: "Failed to delete transaction",
    });
    expect(emitDomainEvent).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
