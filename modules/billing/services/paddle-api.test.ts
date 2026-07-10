import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PaddleApiError,
  createPaddlePortalSession,
  createPaddleTransactionCheckout,
} from "./paddle-api";
import type { PaddleConfig } from "../config/paddle-env";

const CONFIG: PaddleConfig = {
  mode: "paid_beta",
  environment: "sandbox",
  apiKey: "pdl_sdbx_test_key",
  prices: {},
};

const LIVE_CONFIG: PaddleConfig = { ...CONFIG, environment: "production" };

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("paddle api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("createPaddleTransactionCheckout", () => {
    it("posts to the sandbox host with bearer auth and the plan price", async () => {
      const fetchMock = mockFetchOnce(201, {
        data: { id: "txn_01", checkout: { url: "https://sandbox-buy.paddle.com/_ptxn=txn_01" } },
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await createPaddleTransactionCheckout(CONFIG, {
        priceId: "pri_pro_monthly",
        organizationId: "org-1",
        actorId: "user-1",
        customerId: "ctm_1",
      });

      expect(result).toEqual({ transactionId: "txn_01", url: "https://sandbox-buy.paddle.com/_ptxn=txn_01" });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://sandbox-api.paddle.com/transactions");
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer pdl_sdbx_test_key");

      const sent = JSON.parse(init.body);
      expect(sent.items).toEqual([{ price_id: "pri_pro_monthly", quantity: 1 }]);
      expect(sent.customer_id).toBe("ctm_1");
      // The org id is the only thread back to the tenant; the webhook reads it.
      expect(sent.custom_data).toEqual({ organization_id: "org-1", actor_id: "user-1" });
      // We must NOT set checkout.url — that would point checkout at our domain.
      expect(sent.checkout).toBeUndefined();
    });

    it("uses the live host in production", async () => {
      const fetchMock = mockFetchOnce(201, { data: { id: "txn_1", checkout: { url: "https://buy.paddle.com/x" } } });
      vi.stubGlobal("fetch", fetchMock);

      await createPaddleTransactionCheckout(LIVE_CONFIG, {
        priceId: "pri_x",
        organizationId: "org-1",
        actorId: "user-1",
      });

      expect(fetchMock.mock.calls[0][0]).toBe("https://api.paddle.com/transactions");
    });

    it("omits customer_id when there is none", async () => {
      const fetchMock = mockFetchOnce(201, { data: { id: "txn_1", checkout: { url: "https://x" } } });
      vi.stubGlobal("fetch", fetchMock);

      await createPaddleTransactionCheckout(CONFIG, {
        priceId: "pri_x",
        organizationId: "org-1",
        actorId: "user-1",
      });

      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("customer_id");
    });

    it("returns url:null when Paddle omits the checkout url (no default payment link)", async () => {
      // Paddle returns the transaction but with a null checkout url when no
      // default payment link is configured.
      vi.stubGlobal("fetch", mockFetchOnce(201, { data: { id: "txn_1", checkout: { url: null } } }));

      const result = await createPaddleTransactionCheckout(CONFIG, {
        priceId: "pri_x",
        organizationId: "org-1",
        actorId: "user-1",
      });

      expect(result).toEqual({ transactionId: "txn_1", url: null });
    });

    it("throws a typed error carrying Paddle's error code", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetchOnce(400, {
          error: { code: "transaction_default_checkout_url_not_set", detail: "Default payment link not set." },
        }),
      );

      await expect(
        createPaddleTransactionCheckout(CONFIG, { priceId: "pri_x", organizationId: "o", actorId: "u" }),
      ).rejects.toMatchObject({
        name: "PaddleApiError",
        status: 400,
        code: "transaction_default_checkout_url_not_set",
      });
    });

    it("fails fast without an API key, before any network call", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        createPaddleTransactionCheckout({ ...CONFIG, apiKey: undefined }, {
          priceId: "pri_x",
          organizationId: "o",
          actorId: "u",
        }),
      ).rejects.toBeInstanceOf(PaddleApiError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("surfaces a timeout as a typed error", async () => {
      // fetch rejects with an AbortError, as it would when the controller fires.
      const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(abort));

      await expect(
        createPaddleTransactionCheckout(CONFIG, { priceId: "pri_x", organizationId: "o", actorId: "u" }),
      ).rejects.toMatchObject({ name: "PaddleApiError", code: "timeout" });
    });
  });

  describe("createPaddlePortalSession", () => {
    it("posts to the customer's portal-sessions endpoint and returns the overview url", async () => {
      const fetchMock = mockFetchOnce(201, {
        data: { urls: { general: { overview: "https://customer-portal.paddle.com/cpl_1?token=pga_x" } } },
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await createPaddlePortalSession(CONFIG, {
        customerId: "ctm_1",
        subscriptionIds: ["sub_1"],
      });

      expect(result.url).toBe("https://customer-portal.paddle.com/cpl_1?token=pga_x");
      expect(fetchMock.mock.calls[0][0]).toBe("https://sandbox-api.paddle.com/customers/ctm_1/portal-sessions");
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ subscription_ids: ["sub_1"] });
    });

    it("sends an empty body when there are no subscription ids", async () => {
      const fetchMock = mockFetchOnce(201, { data: { urls: { general: { overview: "https://x" } } } });
      vi.stubGlobal("fetch", fetchMock);

      await createPaddlePortalSession(CONFIG, { customerId: "ctm_1" });

      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({});
    });

    it("caps subscription ids at Paddle's limit of 25", async () => {
      const fetchMock = mockFetchOnce(201, { data: { urls: { general: { overview: "https://x" } } } });
      vi.stubGlobal("fetch", fetchMock);

      await createPaddlePortalSession(CONFIG, {
        customerId: "ctm_1",
        subscriptionIds: Array.from({ length: 30 }, (_, i) => `sub_${i}`),
      });

      expect(JSON.parse(fetchMock.mock.calls[0][1].body).subscription_ids).toHaveLength(25);
    });

    it("url-encodes the customer id in the path", async () => {
      const fetchMock = mockFetchOnce(201, { data: { urls: { general: { overview: "https://x" } } } });
      vi.stubGlobal("fetch", fetchMock);

      await createPaddlePortalSession(CONFIG, { customerId: "ctm/../evil" });

      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://sandbox-api.paddle.com/customers/ctm%2F..%2Fevil/portal-sessions",
      );
    });
  });
});
