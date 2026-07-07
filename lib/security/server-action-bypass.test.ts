import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAppAccess = vi.fn();
const accessErrorToActionResult = vi.fn();
const createClient = vi.fn();
const reserveOrganizationUsage = vi.fn();
const billingCreateCheckoutSession = vi.fn();
const requireUser = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: vi.fn() };
});
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "https://nevora.test" }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser }));
vi.mock("@/lib/auth/organization-cookie", () => ({ setSelectedOrganizationId: vi.fn() }));
vi.mock("@/lib/security", () => ({
  requireAppAccess,
  accessErrorToActionResult,
  isAccessError: (err: unknown) => Boolean((err as { code?: string } | null)?.code),
}));
vi.mock("@/lib/events", () => ({
  emitDomainEvent: vi.fn(),
  emitAuditLog: vi.fn(),
}));
vi.mock("@/modules/billing", () => ({
  reserveOrganizationUsage,
  releaseOrganizationUsage: vi.fn(),
  assertPlanLimit: vi.fn(),
}));
vi.mock("@/modules/billing/services/billing-provider", () => ({
  billingProvider: {
    createCheckoutSession: billingCreateCheckoutSession,
    createCustomerPortal: vi.fn(),
  },
}));
vi.mock("@/shared/i18n/get-dictionary", () => ({
  getDictionary: async () => ({ dict: { money: { errors: {} } } }),
}));
vi.mock("@/modules/moneyflow/services/money-categorization.service", () => ({
  categorizeTransaction: vi.fn(),
}));

const { createTaskAction } = await import("@/modules/tasks/actions/create-task.action");
const { createDocumentAction } = await import("@/modules/documents/actions/create-document.action");
const { createTransactionAction } = await import("@/modules/moneyflow/actions/create-transaction.action");
const { executeActionItem } = await import("@/modules/action-center/actions/execute-action-item");
const { createCheckoutSessionAction } = await import("@/modules/billing/actions/create-checkout-session.action");
const { acceptInviteAction } = await import("@/modules/members/actions/accept-invite.action");

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function denyWith(code: string, message: string) {
  const err = Object.assign(new Error(message), { code });
  requireAppAccess.mockRejectedValue(err);
  accessErrorToActionResult.mockImplementation((value: unknown) =>
    value === err ? { error: message } : null,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  createClient.mockResolvedValue({ from: vi.fn(), rpc: vi.fn() });
  requireUser.mockResolvedValue({ id: "user-1" });
});

describe("Server Action/API bypass attempts", () => {
  it("direct task creation is denied for an expired trial before DB writes", async () => {
    denyWith("TRIAL_EXPIRED", "Your trial has ended. Choose a plan to continue editing.");

    const result = await createTaskAction({}, formData({ title: "Bypass task" }));

    expect(result.error).toContain("trial has ended");
    expect(createClient).not.toHaveBeenCalled();
    expect(reserveOrganizationUsage).not.toHaveBeenCalled();
  });

  it("direct document creation is denied for an expired trial before DB writes", async () => {
    denyWith("TRIAL_EXPIRED", "Your trial has ended. Choose a plan to continue editing.");

    const result = await createDocumentAction({}, formData({ title: "Bypass doc" }));

    expect(result.error).toContain("trial has ended");
    expect(createClient).not.toHaveBeenCalled();
    expect(reserveOrganizationUsage).not.toHaveBeenCalled();
  });

  it("direct money transaction creation is denied for an expired trial before reservations", async () => {
    denyWith("TRIAL_EXPIRED", "Your trial has ended. Choose a plan to continue editing.");

    const result = await createTransactionAction(
      {},
      formData({ title: "Bypass tx", type: "expense", amount: "10", account_id: "acc-1" }),
    );

    expect(result.error).toContain("trial has ended");
    expect(createClient).not.toHaveBeenCalled();
    expect(reserveOrganizationUsage).not.toHaveBeenCalled();
  });

  it("direct action-center execution is denied for an expired trial before loading the item", async () => {
    const message = "Your trial has ended. Choose a plan to continue editing.";
    const err = Object.assign(new Error(message), { code: "TRIAL_EXPIRED" });
    requireAppAccess.mockRejectedValue(err);

    const result = await executeActionItem({
      actionItemId: "11111111-1111-4111-8111-111111111111",
      executeKind: "create_task",
      confirmed: true,
    });

    expect(result).toEqual({ ok: false, error: message });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("direct checkout start is denied when billing.manage is missing", async () => {
    denyWith("PERMISSION_DENIED", "You do not have permission to perform this action.");

    const result = await createCheckoutSessionAction(
      {},
      formData({ planSlug: "pro", billingCycle: "monthly" }),
    );

    expect(result.error).toContain("permission");
    expect(billingCreateCheckoutSession).not.toHaveBeenCalled();
  });

  it("direct invite acceptance returns backend RPC denial when current state is invalid", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "trial_already_used" },
    });
    createClient.mockResolvedValue({ rpc });

    const result = await acceptInviteAction(
      {},
      formData({ organizationId: "11111111-1111-4111-8111-111111111111" }),
    );

    expect(result.error).toContain("Это приглашение сейчас недоступно");
    expect(rpc).toHaveBeenCalledWith("accept_invite", {
      p_org_id: "11111111-1111-4111-8111-111111111111",
    });
  });
});
