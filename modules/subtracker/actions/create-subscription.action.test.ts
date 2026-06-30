import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const checkPlanLimit = vi.fn();
const emitDomainEvent = vi.fn();
const getDictionary = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
vi.mock("@/lib/billing", () => ({ checkPlanLimit }));
vi.mock("@/lib/events", () => ({ emitDomainEvent }));
vi.mock("@/shared/i18n/get-dictionary", () => ({ getDictionary }));

const { createSubscriptionAction } = await import("./create-subscription.action");

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const SUBSCRIPTION_ID = "44444444-4444-4444-8444-444444444444";

const single = vi.fn();
const select = vi.fn(() => ({ single }));
const insert = vi.fn(() => ({ select }));
const from = vi.fn(() => ({ insert }));

function makeForm(): FormData {
  const formData = new FormData();
  formData.set("name", "Nevora Cloud");
  formData.set("amount", "19.99");
  formData.set("currency", "USD");
  formData.set("billing_cycle", "monthly");
  formData.set("next_billing_date", "2026-07-15");
  formData.set("category", "cloud");
  formData.set("url", "https://example.com");
  formData.set("note", "Team plan");
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  getDictionary.mockResolvedValue({
    dict: {
      subscriptions: {
        errors: {
          nameRequired: "Name is required",
          amountRequired: "Amount is required",
          amountPositive: "Amount must be positive",
          invalidCycle: "Invalid cycle",
          invalidCategory: "Invalid category",
          invalidCurrency: "Invalid currency",
          dateRequired: "Date is required",
          invalidDate: "Invalid date",
          createFailed: "Create failed",
          serverError: "Server error",
        },
      },
    },
  });
  requireOrg.mockResolvedValue({
    user: { id: USER_ID },
    org: { id: ORGANIZATION_ID },
    workspace: { id: WORKSPACE_ID },
  });
  checkPlanLimit.mockResolvedValue({ allowed: true });
  createClient.mockResolvedValue({ from });
  single.mockResolvedValue({ data: { id: SUBSCRIPTION_ID }, error: null });
  emitDomainEvent.mockResolvedValue(undefined);
});

describe("createSubscriptionAction", () => {
  it("creates only the subscription and never creates or emits a money transaction", async () => {
    await expect(createSubscriptionAction({}, makeForm())).resolves.toEqual({ subscriptionId: SUBSCRIPTION_ID });

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("subscriptions");
    expect(from).not.toHaveBeenCalledWith("money_transactions");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORGANIZATION_ID,
        workspace_id: WORKSPACE_ID,
        name: "Nevora Cloud",
        amount: 19.99,
        currency: "USD",
      }),
    );

    expect(emitDomainEvent).toHaveBeenCalledTimes(1);
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "subscription.created",
        aggregateType: "subscription",
        aggregateId: SUBSCRIPTION_ID,
        payload: expect.objectContaining({ currency: "USD" }),
      }),
    );
    expect(emitDomainEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "money.transaction.created" }),
    );

    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/subscriptions");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).not.toHaveBeenCalledWith("/dashboard/money");
  });

  it("rejects an unsupported currency before writing AI-prefilled data", async () => {
    const formData = makeForm();
    formData.set("currency", "XYZ");

    await expect(createSubscriptionAction({}, formData)).resolves.toEqual({
      fieldErrors: { currency: ["Invalid currency"] },
    });

    expect(from).not.toHaveBeenCalled();
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });
});
