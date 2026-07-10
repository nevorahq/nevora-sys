import { afterEach, describe, expect, it, vi } from "vitest";

const { checkoutMock, portalMock, getCustomerIdMock, getSubscriptionIdMock } = vi.hoisted(() => ({
  checkoutMock: vi.fn(),
  portalMock: vi.fn(),
  getCustomerIdMock: vi.fn(),
  getSubscriptionIdMock: vi.fn(),
}));

vi.mock("./paddle-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./paddle-api")>();
  return {
    ...actual,
    createPaddleTransactionCheckout: checkoutMock,
    createPaddlePortalSession: portalMock,
  };
});

vi.mock("./billing-repository", () => ({
  billingRepository: {
    getProviderCustomerId: getCustomerIdMock,
    getProviderSubscriptionId: getSubscriptionIdMock,
  },
}));

import { PaddleBillingAdapter } from "./paddle-billing.adapter";
import { PaddleApiError } from "./paddle-api";
import type { PaddleConfig } from "../config/paddle-env";

const CONFIGURED: PaddleConfig = {
  mode: "paid_beta",
  environment: "sandbox",
  apiKey: "pdl_sdbx_key",
  webhookSecret: "pdl_ntfset_secret",
  prices: {
    proMonthly: "pri_pro_monthly",
    proYearly: "pri_pro_yearly",
    starterMonthly: "pri_starter_monthly",
    starterYearly: "pri_starter_yearly",
    businessMonthly: "pri_business_monthly",
    businessYearly: "pri_business_yearly",
  },
};

const checkoutInput = {
  organizationId: "org-1",
  actorId: "user-1",
  planCode: "pro" as const,
  billingCycle: "monthly" as const,
  returnUrl: "https://app.example/dashboard/settings/billing",
};

describe("PaddleBillingAdapter.createCheckoutSession", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a Paddle checkout and returns its url", async () => {
    getCustomerIdMock.mockResolvedValueOnce("ctm_1");
    checkoutMock.mockResolvedValueOnce({ transactionId: "txn_1", url: "https://buy.paddle.com/x" });

    const adapter = new PaddleBillingAdapter(CONFIGURED);
    const session = await adapter.createCheckoutSession(checkoutInput);

    expect(session).toMatchObject({ provider: "paddle", configured: true, url: "https://buy.paddle.com/x" });
    expect(checkoutMock).toHaveBeenCalledWith(
      CONFIGURED,
      expect.objectContaining({ priceId: "pri_pro_monthly", organizationId: "org-1", customerId: "ctm_1" }),
    );
  });

  it("does not call Paddle when the config is not checkout-ready", async () => {
    // No prices configured → isPaddleCheckoutAvailable is false.
    const adapter = new PaddleBillingAdapter({ ...CONFIGURED, prices: {} });
    const session = await adapter.createCheckoutSession(checkoutInput);

    expect(session).toMatchObject({ configured: false, url: null });
    expect(checkoutMock).not.toHaveBeenCalled();
  });

  it("turns a missing default payment link into url:null, not a crash", async () => {
    getCustomerIdMock.mockResolvedValueOnce(null);
    checkoutMock.mockRejectedValueOnce(
      new PaddleApiError(400, "transaction_default_checkout_url_not_set", "not set"),
    );

    const adapter = new PaddleBillingAdapter(CONFIGURED);
    const session = await adapter.createCheckoutSession(checkoutInput);

    // configured:true, but url:null — the caller shows "not connected yet".
    expect(session).toMatchObject({ configured: true, url: null });
  });

  it("rethrows unexpected Paddle errors", async () => {
    getCustomerIdMock.mockResolvedValueOnce(null);
    checkoutMock.mockRejectedValueOnce(new PaddleApiError(500, "internal_error", "boom"));

    const adapter = new PaddleBillingAdapter(CONFIGURED);
    await expect(adapter.createCheckoutSession(checkoutInput)).rejects.toBeInstanceOf(PaddleApiError);
  });
});

describe("PaddleBillingAdapter.createCustomerPortal", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("opens a portal session scoped to the org's subscription", async () => {
    getCustomerIdMock.mockResolvedValueOnce("ctm_1");
    getSubscriptionIdMock.mockResolvedValueOnce("sub_1");
    portalMock.mockResolvedValueOnce({ url: "https://customer-portal.paddle.com/x" });

    const adapter = new PaddleBillingAdapter(CONFIGURED);
    const session = await adapter.createCustomerPortal({
      organizationId: "org-1",
      returnUrl: "https://app.example/dashboard/settings/billing",
    });

    expect(session).toMatchObject({ configured: true, url: "https://customer-portal.paddle.com/x" });
    expect(portalMock).toHaveBeenCalledWith(CONFIGURED, { customerId: "ctm_1", subscriptionIds: ["sub_1"] });
  });

  it("returns url:null when the org has no customer on file", async () => {
    getCustomerIdMock.mockResolvedValueOnce(null);

    const adapter = new PaddleBillingAdapter(CONFIGURED);
    const session = await adapter.createCustomerPortal({
      organizationId: "org-1",
      returnUrl: "https://app.example/dashboard/settings/billing",
    });

    expect(session).toMatchObject({ configured: true, url: null });
    expect(portalMock).not.toHaveBeenCalled();
  });

  it("opens the portal on overview when there is no subscription id", async () => {
    getCustomerIdMock.mockResolvedValueOnce("ctm_1");
    getSubscriptionIdMock.mockResolvedValueOnce(null);
    portalMock.mockResolvedValueOnce({ url: "https://customer-portal.paddle.com/overview" });

    const adapter = new PaddleBillingAdapter(CONFIGURED);
    await adapter.createCustomerPortal({
      organizationId: "org-1",
      returnUrl: "https://app.example/dashboard/settings/billing",
    });

    expect(portalMock).toHaveBeenCalledWith(CONFIGURED, { customerId: "ctm_1", subscriptionIds: undefined });
  });
});
