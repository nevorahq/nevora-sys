import { describe, expect, it, vi } from "vitest";
import {
  SUBSCRIPTIONS_HTTP_TRANSPORT_HEADER,
  SUBSCRIPTIONS_HTTP_TRANSPORT_VERSION,
  signSubscriptionsServiceToken,
  type SubscriptionsApplication,
  type SubscriptionsRequestContext,
} from "@nevora/subscriptions-api";
import { handleSubscriptionsRequest } from "./request-handler";
import { SubscriptionsRuntimeConfigurationError } from "./environment";

const SECRET = "subscriptions-service-secret-that-is-long-enough-1";
const context: SubscriptionsRequestContext = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  actorId: "33333333-3333-4333-8333-333333333333",
  permissions: ["org.read", "data.write"],
};

function request(
  operation: "getSubscriptions" | "createSubscriptionPaymentCycle",
  input: Record<string, unknown>,
  tokenOperation = operation,
) {
  const token = signSubscriptionsServiceToken(
    { context, operation: tokenOperation, ttlSeconds: 60 },
    SECRET,
  );
  return new Request("http://subscriptions.local/api/internal/subscriptions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [SUBSCRIPTIONS_HTTP_TRANSPORT_HEADER]: SUBSCRIPTIONS_HTTP_TRANSPORT_VERSION,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ operation, input }),
  });
}

function dependencies(application: Partial<SubscriptionsApplication> = {}) {
  return {
    readEnvironment: () => ({
      supabaseUrl: "https://example.supabase.co",
      supabaseServiceRoleKey: "service-role-key",
      serviceAuthSecret: SECRET,
      tasksApiUrl: "https://tasks.example.test",
      tasksServiceAuthSecret: "tasks-service-secret-that-is-long-enough-too",
    }),
    createClient: () => ({}) as never,
    resolveContext: vi.fn(async () => context),
    createApplication: () => application as SubscriptionsApplication,
  };
}

describe("standalone Subscriptions request handler", () => {
  it("hides requests without the strict transport header", async () => {
    const response = await handleSubscriptionsRequest(
      new Request("http://subscriptions.local/api/internal/subscriptions"),
    );
    expect(response.status).toBe(404);
  });

  it("executes a read locally after token and live-context validation", async () => {
    const getSubscriptions = vi.fn(async () => []);
    const deps = dependencies({ getSubscriptions });
    const response = await handleSubscriptionsRequest(request("getSubscriptions", {}), deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: [] });
    expect(deps.resolveContext).toHaveBeenCalledOnce();
    expect(getSubscriptions).toHaveBeenCalledOnce();
  });

  it("rejects a token replayed for another operation", async () => {
    const createSubscriptionPaymentCycle = vi.fn();
    const response = await handleSubscriptionsRequest(
      request(
        "createSubscriptionPaymentCycle",
        {
          subscription: {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Figma",
            amount: 15,
            currency: "USD",
            billing_cycle: "monthly",
            billing_anchor_day: 15,
            next_billing_date: "2026-08-15",
            default_category_id: null,
            auto_task_enabled: true,
            is_active: true,
            cancelled_at: null,
            workspace_id: null,
          },
          dueDate: "2026-08-15",
        },
        "getSubscriptions",
      ),
      dependencies({ createSubscriptionPaymentCycle }),
    );

    expect(response.status).toBe(401);
    expect(createSubscriptionPaymentCycle).not.toHaveBeenCalled();
  });

  it("fails closed when runtime secrets are missing", async () => {
    const response = await handleSubscriptionsRequest(
      request("getSubscriptions", {}),
      { readEnvironment: () => { throw new SubscriptionsRuntimeConfigurationError("missing"); } },
    );
    expect(response.status).toBe(503);
  });
});
