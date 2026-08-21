import { describe, expect, it, vi } from "vitest";
import {
  FINANCE_HTTP_TRANSPORT_HEADER,
  FINANCE_HTTP_TRANSPORT_VERSION,
  signFinanceServiceToken,
  type FinanceApplication,
  type FinanceRequestContext,
} from "@nevora/finance-api";
import { handleFinanceRequest } from "./request-handler";
import { FinanceRuntimeConfigurationError } from "./environment";

const SECRET = "finance-service-secret-that-is-long-enough-123";
const context: FinanceRequestContext = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  actorId: "33333333-3333-4333-8333-333333333333",
  permissions: ["org.read", "data.write"],
};

function request(
  operation: "getAccounts" | "createMoneyAccount",
  input: Record<string, unknown>,
  tokenOperation = operation,
) {
  const token = signFinanceServiceToken(
    { context, operation: tokenOperation, ttlSeconds: 60 },
    SECRET,
  );
  return new Request("http://finance.local/api/internal/finance", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [FINANCE_HTTP_TRANSPORT_HEADER]: FINANCE_HTTP_TRANSPORT_VERSION,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ operation, input }),
  });
}

function dependencies(application: Partial<FinanceApplication> = {}) {
  return {
    readEnvironment: () => ({
      supabaseUrl: "https://example.supabase.co",
      supabaseServiceRoleKey: "service-role-key",
      serviceAuthSecret: SECRET,
    }),
    createClient: () => ({}) as never,
    resolveContext: vi.fn(async () => context),
    createApplication: () => application as FinanceApplication,
  };
}

describe("standalone Finance request handler", () => {
  it("hides requests without the strict transport header", async () => {
    const response = await handleFinanceRequest(new Request("http://finance.local/api/internal/finance"));
    expect(response.status).toBe(404);
  });

  it("executes a read locally after token and live-context validation", async () => {
    const getAccounts = vi.fn(async () => []);
    const deps = dependencies({ getAccounts });
    const response = await handleFinanceRequest(request("getAccounts", {}), deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: [] });
    expect(deps.resolveContext).toHaveBeenCalledOnce();
    expect(getAccounts).toHaveBeenCalledOnce();
  });

  it("rejects a token replayed for another operation", async () => {
    const createMoneyAccount = vi.fn();
    const response = await handleFinanceRequest(
      request(
        "createMoneyAccount",
        { name: "Cash", type: "cash", initialBalance: 0, currency: "USD" },
        "getAccounts",
      ),
      dependencies({ createMoneyAccount }),
    );

    expect(response.status).toBe(401);
    expect(createMoneyAccount).not.toHaveBeenCalled();
  });

  it("fails closed when runtime secrets are missing", async () => {
    const response = await handleFinanceRequest(
      request("getAccounts", {}),
      { readEnvironment: () => { throw new FinanceRuntimeConfigurationError("missing"); } },
    );
    expect(response.status).toBe(503);
  });
});
