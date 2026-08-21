import { describe, expect, it, vi } from "vitest";
import {
  FINANCE_HTTP_TRANSPORT_HEADER,
  FINANCE_HTTP_TRANSPORT_VERSION,
} from "@nevora/finance-api";
import { createHttpFinanceApplication, FinanceTransportError } from "./http";

const context = Object.freeze({
  organizationId: "org-1",
  workspaceId: "workspace-1",
  actorId: "user-1",
  permissions: ["data.read"],
});

describe("createHttpFinanceApplication", () => {
  it("sends only operation input and forwards the authenticated session", async () => {
    const fetchImplementation = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ ok: true, data: { ok: true, accounts: [] } }),
    );
    const application = createHttpFinanceApplication({
      baseUrl: "https://finance.example.test",
      cookieHeader: "sb-session=secret",
      context,
      fetchImplementation,
    });

    await application.findActiveMoneyAccountsByCurrency("USD");

    const [url, init] = fetchImplementation.mock.calls[0];
    expect(String(url)).toBe("https://finance.example.test/api/internal/finance");
    expect(init?.headers).toMatchObject({
      cookie: "sb-session=secret",
      [FINANCE_HTTP_TRANSPORT_HEADER]: FINANCE_HTTP_TRANSPORT_VERSION,
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      operation: "findActiveMoneyAccountsByCurrency",
      input: { currency: "USD" },
    });
    expect(String(init?.body)).not.toContain("organizationId");
    expect(String(init?.body)).not.toContain("workspaceId");
  });

  it("maps transport failures to a stable error", async () => {
    const application = createHttpFinanceApplication({
      baseUrl: "https://finance.example.test",
      cookieHeader: "sb-session=secret",
      context,
      fetchImplementation: vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ ok: false, error: "Forbidden", code: "PERMISSION_DENIED" }, { status: 403 }),
      ),
    });

    await expect(application.getAccounts()).rejects.toEqual(
      expect.objectContaining<FinanceTransportError>({
        name: "FinanceTransportError",
        message: "Forbidden",
        status: 403,
      }),
    );
  });

  it("uses an operation-bound bearer token when no session exists", async () => {
    const fetchImplementation = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ ok: true, data: [] }),
    );
    const serviceTokenFactory = vi.fn(() => "nfs1.payload.signature");
    const application = createHttpFinanceApplication({
      baseUrl: "https://finance.example.test",
      serviceTokenFactory,
      context,
      fetchImplementation,
    });
    await application.getAccounts();

    expect(serviceTokenFactory).toHaveBeenCalledWith({ operation: "getAccounts", input: {} });
    const init = fetchImplementation.mock.calls[0][1];
    expect(init?.headers).toMatchObject({ authorization: "Bearer nfs1.payload.signature" });
    expect(init?.headers).not.toHaveProperty("cookie");
  });
});
