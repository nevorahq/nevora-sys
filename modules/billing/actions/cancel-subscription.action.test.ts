import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAppAccess = vi.fn();
const accessErrorToActionResult = vi.fn();
const createCustomerPortal = vi.fn();
const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` });
});
const createClient = vi.fn();

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "https://nevora.test" }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/security", () => ({ requireAppAccess, accessErrorToActionResult }));
vi.mock("@/modules/billing/services/billing-provider", () => ({
  billingProvider: { createCustomerPortal },
}));
// If the action ever tried to mutate billing state directly, it would import
// the server supabase client — this mock lets us assert it never does.
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { cancelSubscriptionAction } = await import("./cancel-subscription.action");

function grant(roleId = "owner") {
  requireAppAccess.mockResolvedValue({
    user: { id: "user-1" },
    org: { id: "org-1" },
    membership: { roleId },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cancelSubscriptionAction — provider boundary", () => {
  it("returns an honest typed error and never mutates billing when no provider is connected", async () => {
    grant("owner");
    createCustomerPortal.mockResolvedValue({ provider: null, configured: false, url: null });

    const result = await cancelSubscriptionAction({}, new FormData());

    expect(result.error).toMatch(/not connected/i);
    expect(redirect).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("opens the provider portal instead of cancelling internally when a provider is configured", async () => {
    grant("owner");
    createCustomerPortal.mockResolvedValue({
      provider: "stripe",
      configured: true,
      url: "https://billing.stripe.test/session/abc",
    });

    await expect(cancelSubscriptionAction({}, new FormData())).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("https://billing.stripe.test/session/abc");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("still enforces the admin/owner check", async () => {
    grant("member");

    const result = await cancelSubscriptionAction({}, new FormData());

    expect(result.error).toMatch(/only admins/i);
    expect(createCustomerPortal).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("surfaces a typed permission denial from the access gate", async () => {
    const err = Object.assign(new Error("You do not have permission to perform this action."), {
      code: "PERMISSION_DENIED",
    });
    requireAppAccess.mockRejectedValue(err);
    accessErrorToActionResult.mockImplementation((value: unknown) =>
      value === err ? { error: err.message } : null,
    );

    const result = await cancelSubscriptionAction({}, new FormData());

    expect(result.error).toContain("permission");
    expect(createCustomerPortal).not.toHaveBeenCalled();
  });
});
