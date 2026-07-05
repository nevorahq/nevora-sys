import { beforeEach, describe, expect, it, vi } from "vitest";

const createEntityLink = vi.fn();
const emitDomainEvent = vi.fn();
const emitAuditLog = vi.fn();
const createSubscriptionPaymentTaskForCycle = vi.fn();

vi.mock("@/lib/entity-links", () => ({ createEntityLink }));
vi.mock("@/lib/events", () => ({ emitDomainEvent, emitAuditLog }));
vi.mock("./create-subscription-payment-task", () => ({ createSubscriptionPaymentTaskForCycle }));

const { markSubscriptionPaymentAsPaid } = await import("./mark-subscription-payment-as-paid");

const ORG = "11111111-1111-4111-8111-111111111111";
const WS = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const CYCLE = "44444444-4444-4444-8444-444444444444";
const SUB = "55555555-5555-4555-8555-555555555555";
const ACCOUNT = "66666666-6666-4666-8666-666666666666";

const ctx = { org: { id: ORG }, workspace: { id: WS }, user: { id: USER } } as never;

const currentCycle = {
  id: CYCLE,
  organization_id: ORG,
  workspace_id: WS,
  subscription_id: SUB,
  due_date: "2026-07-15",
  billing_period_key: "2026-07",
  expected_amount: 24,
  currency: "EUR",
  status: "task_open",
  task_id: "task-1",
};

const subscription = {
  id: SUB,
  name: "Figma",
  amount: 24,
  currency: "EUR",
  billing_cycle: "monthly",
  billing_anchor_day: 15,
  next_billing_date: "2026-07-15",
  default_category_id: null,
  auto_task_enabled: true,
  is_active: true,
  cancelled_at: null,
  workspace_id: WS,
};

const maybeSingle = vi.fn();
const rpc = vi.fn();

function makeSupabase() {
  const eq2 = vi.fn(() => ({ maybeSingle }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1 }));
  const from = vi.fn(() => ({ select }));
  return { from, rpc } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  createEntityLink.mockResolvedValue({ ok: true, data: { id: "link" } });
  emitDomainEvent.mockResolvedValue(undefined);
  emitAuditLog.mockResolvedValue(undefined);
  createSubscriptionPaymentTaskForCycle.mockResolvedValue({ ok: true, taskId: "next-task", created: true });
});

describe("markSubscriptionPaymentAsPaid", () => {
  it("posts one expense, links it, and provisions the next cycle's task", async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: currentCycle })
      .mockResolvedValueOnce({ data: subscription })
      .mockResolvedValueOnce({ data: { ...currentCycle, id: "next-cycle", status: "planned" } });
    rpc.mockResolvedValue({
      data: {
        already_paid: false,
        cycle_id: CYCLE,
        transaction_id: "tx-1",
        task_id: "task-1",
        next_cycle_id: "next-cycle",
        workspace_id: WS,
        subscription_id: SUB,
      },
      error: null,
    });

    const res = await markSubscriptionPaymentAsPaid({
      supabase: makeSupabase(),
      ctx,
      cycleId: CYCLE,
      accountId: ACCOUNT,
    });

    expect(res).toEqual({ ok: true, transactionId: "tx-1", alreadyPaid: false, nextCycleId: "next-cycle" });

    // Exactly one atomic RPC — one expense.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "mark_subscription_payment_paid",
      expect.objectContaining({ p_organization_id: ORG, p_cycle_id: CYCLE, p_account_id: ACCOUNT, p_next_due_date: "2026-08-15" }),
    );

    // money.transaction.created carries subscription_id → auto paid_by link.
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "money.transaction.created",
        payload: expect.objectContaining({ type: "expense", status: "posted", subscription_id: SUB }),
      }),
    );
    expect(emitDomainEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "subscription.payment_cycle.paid" }));
    expect(createEntityLink).toHaveBeenCalledWith(expect.objectContaining({ linkType: "generated_from" }));
    expect(createSubscriptionPaymentTaskForCycle).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: an already-paid cycle creates no new expense", async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: { ...currentCycle, status: "paid", transaction_id: "tx-existing" } })
      .mockResolvedValueOnce({ data: subscription });
    rpc.mockResolvedValue({
      data: { already_paid: true, cycle_id: CYCLE, transaction_id: "tx-existing", task_id: "task-1", next_cycle_id: null },
      error: null,
    });

    const res = await markSubscriptionPaymentAsPaid({
      supabase: makeSupabase(),
      ctx,
      cycleId: CYCLE,
      accountId: ACCOUNT,
    });

    expect(res).toEqual({ ok: true, transactionId: "tx-existing", alreadyPaid: true, nextCycleId: null });
    // No duplicate expense, no links, no next task.
    expect(emitDomainEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "money.transaction.created" }),
    );
    expect(createEntityLink).not.toHaveBeenCalled();
    expect(createSubscriptionPaymentTaskForCycle).not.toHaveBeenCalled();
  });

  it("surfaces a friendly error when the cycle is no longer payable", async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: currentCycle })
      .mockResolvedValueOnce({ data: subscription });
    rpc.mockResolvedValue({ data: null, error: { message: "cycle_not_payable" } });

    const res = await markSubscriptionPaymentAsPaid({
      supabase: makeSupabase(),
      ctx,
      cycleId: CYCLE,
      accountId: ACCOUNT,
    });

    expect(res).toEqual({ ok: false, error: "This payment cycle can no longer be paid" });
    expect(createEntityLink).not.toHaveBeenCalled();
  });
});
