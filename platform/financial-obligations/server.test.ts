import { beforeEach, describe, expect, it, vi } from "vitest";

const hasPaidSubscriptionCycleForTransaction = vi.fn();
const hasPaidTaskForTransaction = vi.fn();
const getTasksApplication = vi.fn(async () => ({ hasPaidTaskForTransaction }));

vi.mock("@/modules/subtracker/server", () => ({ hasPaidSubscriptionCycleForTransaction }));
vi.mock("@/platform/tasks/server", () => ({ getTasksApplication }));

const { findPaidObligationForTransaction } = await import("./server");

const params = {
  supabase: {} as never,
  currentContext: {
    org: { id: "11111111-1111-4111-8111-111111111111" },
    workspace: { id: "workspace-1" },
    user: { id: "user-1" },
  } as never,
  transactionId: "22222222-2222-4222-8222-222222222222",
};

beforeEach(() => {
  vi.clearAllMocks();
  hasPaidSubscriptionCycleForTransaction.mockResolvedValue(false);
  hasPaidTaskForTransaction.mockResolvedValue(false);
});

describe("findPaidObligationForTransaction", () => {
  it("returns the subscription owner without querying Tasks", async () => {
    hasPaidSubscriptionCycleForTransaction.mockResolvedValue(true);

    await expect(findPaidObligationForTransaction(params)).resolves.toBe("subscription_cycle");
    expect(hasPaidTaskForTransaction).not.toHaveBeenCalled();
  });

  it("falls through to the Tasks owner port", async () => {
    hasPaidTaskForTransaction.mockResolvedValue(true);

    await expect(findPaidObligationForTransaction(params)).resolves.toBe("financial_task");
    expect(hasPaidTaskForTransaction).toHaveBeenCalledWith(params.transactionId);
  });

  it("allows deletion when no owner reports a paid obligation", async () => {
    await expect(findPaidObligationForTransaction(params)).resolves.toBeNull();
  });
});
