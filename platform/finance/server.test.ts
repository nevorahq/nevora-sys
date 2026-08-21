import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentContext } from "@/lib/context/current-context";

const requestHeaders = vi.fn(async () => new Headers({
  cookie: "sb-session=secret",
  host: "app.example.test",
  "x-forwarded-proto": "https",
}));

vi.mock("next/headers", () => ({ headers: requestHeaders }));
vi.mock("next/server", () => ({ after: vi.fn() }));

const getAccounts = vi.fn();
const findActiveMoneyAccountsByCurrency = vi.fn();
const createMoneyAccount = vi.fn();
const findDuplicateTransaction = vi.fn();

vi.mock("@/modules/moneyflow/server", () => ({
  getAccounts,
  findActiveMoneyAccountsByCurrency,
  createMoneyAccount,
  findDuplicateTransaction,
}));

const {
  createInProcessFinanceApplication,
  getFinanceApplication,
  resolveFinanceShadowReadPercent,
  resolveFinanceTransportMode,
} = await import("./server");

const currentContext = {
  org: { id: "org-1" },
  workspace: { id: "workspace-1" },
  user: { id: "user-1" },
  permissions: new Set(["data.read", "data.write"]),
} as unknown as CurrentContext;
const supabase = { marker: "client" } as never;

const previousTransport = process.env.FINANCE_TRANSPORT;
const previousApiUrl = process.env.FINANCE_API_URL;
const previousServiceSecret = process.env.FINANCE_SERVICE_AUTH_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FINANCE_TRANSPORT;
  delete process.env.FINANCE_API_URL;
  delete process.env.FINANCE_SERVICE_AUTH_SECRET;
});

afterAll(() => {
  if (previousTransport === undefined) delete process.env.FINANCE_TRANSPORT;
  else process.env.FINANCE_TRANSPORT = previousTransport;
  if (previousApiUrl === undefined) delete process.env.FINANCE_API_URL;
  else process.env.FINANCE_API_URL = previousApiUrl;
  if (previousServiceSecret === undefined) delete process.env.FINANCE_SERVICE_AUTH_SECRET;
  else process.env.FINANCE_SERVICE_AUTH_SECRET = previousServiceSecret;
});

describe("createInProcessFinanceApplication", () => {
  it("binds trusted tenant identity once", () => {
    const application = createInProcessFinanceApplication({ supabase, currentContext });

    expect(application.context).toEqual({
      organizationId: "org-1",
      workspaceId: "workspace-1",
      actorId: "user-1",
      permissions: ["data.read", "data.write"],
    });
    expect(Object.isFrozen(application.context)).toBe(true);
  });

  it("pins the account list read to the authenticated organization", async () => {
    const application = createInProcessFinanceApplication({ supabase, currentContext });
    await application.getAccounts();
    expect(getAccounts).toHaveBeenCalledWith("org-1");
  });

  it("injects infrastructure into the mutation without exposing it in the port", async () => {
    const application = createInProcessFinanceApplication({ supabase, currentContext });
    const input = { name: "Cash", type: "cash", initialBalance: 0, currency: "USD" } as never;

    await application.createMoneyAccount(input);
    expect(createMoneyAccount).toHaveBeenCalledWith(supabase, currentContext, input);
  });

  it("scopes the duplicate-transaction check to the authenticated organization", async () => {
    const application = createInProcessFinanceApplication({ supabase, currentContext });
    const input = { merchantName: "Figma", totalAmount: 15, currency: "USD", transactionDate: "2026-07-15" };

    await application.findDuplicateTransaction(input);
    expect(findDuplicateTransaction).toHaveBeenCalledWith(supabase, { organizationId: "org-1", ...input });
  });

  describe("findActiveMoneyAccountsByCurrency", () => {
    it("reshapes a successful Postgrest read into the port's ok:true shape", async () => {
      findActiveMoneyAccountsByCurrency.mockResolvedValue({ data: [{ id: "acc-1" }], error: null });
      const application = createInProcessFinanceApplication({ supabase, currentContext });

      await expect(application.findActiveMoneyAccountsByCurrency("USD")).resolves.toEqual({
        ok: true,
        accounts: [{ id: "acc-1" }],
      });
      expect(findActiveMoneyAccountsByCurrency).toHaveBeenCalledWith(supabase, "org-1", "USD");
    });

    it("reshapes a Postgrest error into ok:false instead of an empty list", async () => {
      findActiveMoneyAccountsByCurrency.mockResolvedValue({ data: null, error: { message: "connection reset" } });
      const application = createInProcessFinanceApplication({ supabase, currentContext });

      await expect(application.findActiveMoneyAccountsByCurrency("USD")).resolves.toEqual({
        ok: false,
        error: "connection reset",
      });
    });
  });
});

describe("Finance transport selection", () => {
  it("keeps in-process as the safe default", async () => {
    const application = await getFinanceApplication({ supabase, currentContext });
    await application.getAccounts();

    expect(getAccounts).toHaveBeenCalledWith("org-1");
    expect(requestHeaders).not.toHaveBeenCalled();
  });

  it("constructs the HTTP adapter only when explicitly enabled", async () => {
    process.env.FINANCE_TRANSPORT = "http";
    process.env.FINANCE_API_URL = "https://finance.example.test";
    process.env.FINANCE_SERVICE_AUTH_SECRET = "a-secure-finance-service-secret-value-1";

    const application = await getFinanceApplication({ supabase, currentContext });

    expect(application.context.organizationId).toBe("org-1");
    expect(requestHeaders).toHaveBeenCalledTimes(1);
  });

  it("allows a service-token transport when no session cookie exists", async () => {
    process.env.FINANCE_TRANSPORT = "http";
    process.env.FINANCE_API_URL = "https://finance.example.test";
    process.env.FINANCE_SERVICE_AUTH_SECRET = "a-secure-finance-service-secret-value-1";
    requestHeaders.mockResolvedValueOnce(new Headers({ host: "app.example.test" }));

    await expect(getFinanceApplication({ supabase, currentContext })).resolves.toMatchObject({
      context: { organizationId: "org-1" },
    });
  });

  it("fails closed when the independent runtime signing secret is missing", async () => {
    process.env.FINANCE_TRANSPORT = "http";
    process.env.FINANCE_API_URL = "https://finance.example.test";

    await expect(getFinanceApplication({ supabase, currentContext })).rejects.toThrow(
      "FINANCE_SERVICE_AUTH_SECRET",
    );
  });

  it("fails closed on an unsupported transport value", () => {
    expect(() => resolveFinanceTransportMode("direct-db")).toThrow(
      "Unsupported FINANCE_TRANSPORT value",
    );
  });

  it("supports the staged shadow and remote-read modes", () => {
    expect(resolveFinanceTransportMode("shadow")).toBe("shadow");
    expect(resolveFinanceTransportMode("http-read")).toBe("http-read");
    expect(resolveFinanceTransportMode("http")).toBe("http");
  });

  it("validates the shadow sampling percentage", () => {
    expect(resolveFinanceShadowReadPercent(undefined)).toBe(100);
    expect(resolveFinanceShadowReadPercent("10")).toBe(10);
    expect(() => resolveFinanceShadowReadPercent("101")).toThrow("between 0 and 100");
  });
});
