import { describe, expect, it, vi } from "vitest";
import { runSubscriptionsCutoverCheck } from "./subscriptions-cutover-check.mjs";

const environment = {
  SUBSCRIPTIONS_API_URL: "https://subscriptions.example.test",
  SUBSCRIPTIONS_CANARY_SOURCE_URL: "https://root.example.test",
  SUBSCRIPTIONS_SERVICE_AUTH_SECRET: "a-secure-subscriptions-service-secret-1",
  SUBSCRIPTIONS_CANARY_ORGANIZATION_ID: "11111111-1111-4111-8111-111111111111",
  SUBSCRIPTIONS_CANARY_WORKSPACE_ID: "22222222-2222-4222-8222-222222222222",
  SUBSCRIPTIONS_CANARY_ACTOR_ID: "33333333-3333-4333-8333-333333333333",
};

describe("Subscriptions cutover check", () => {
  it("checks health, readiness, signed RPC and source parity", async () => {
    const fetchImplementation = vi.fn(async (url: URL, init?: RequestInit) => {
      if (url.pathname === "/api/health") {
        return Response.json({
          status: "ok",
          service: "subscriptions",
          stage: "standalone_runtime_ready",
        });
      }
      if (url.pathname === "/api/ready") {
        return Response.json({
          status: "ready",
          service: "subscriptions",
          databaseConfigured: true,
          databaseConnected: true,
          serviceIdentityConfigured: true,
        });
      }
      expect(init?.headers).toMatchObject({
        authorization: expect.stringMatching(/^Bearer nss1\./),
      });
      return Response.json({ ok: true, data: [{ id: "sub-1", name: "Safe" }] });
    });

    await expect(runSubscriptionsCutoverCheck({
      environment: environment as unknown as NodeJS.ProcessEnv,
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    })).resolves.toMatchObject({
      ok: true,
      checks: [
        { name: "health", ok: true },
        { name: "ready", ok: true },
        { name: "target-rpc", ok: true, count: 1 },
        { name: "source-target-parity", ok: true },
      ],
    });
  });

  it("fails when source and target reads diverge", async () => {
    const fetchImplementation = vi.fn(async (url: URL) => {
      if (url.pathname === "/api/health") {
        return Response.json({
          status: "ok",
          service: "subscriptions",
          stage: "standalone_runtime_ready",
        });
      }
      if (url.pathname === "/api/ready") {
        return Response.json({
          status: "ready",
          service: "subscriptions",
          databaseConfigured: true,
          databaseConnected: true,
          serviceIdentityConfigured: true,
        });
      }
      return Response.json({
        ok: true,
        data: [{ id: url.origin.includes("root") ? "source" : "target" }],
      });
    });

    await expect(runSubscriptionsCutoverCheck({
      environment: environment as unknown as NodeJS.ProcessEnv,
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    })).rejects.toThrow(
      "parity mismatch",
    );
  });
});
