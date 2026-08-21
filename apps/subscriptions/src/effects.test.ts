import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionsRequestContext } from "@nevora/subscriptions-api";
import { createDatabaseSubscriptionsRuntimeEffects } from "./effects";

const context: SubscriptionsRequestContext = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  actorId: "33333333-3333-4333-8333-333333333333",
  permissions: ["org.read", "data.write"],
};

const tasksEnvironment = {
  tasksApiUrl: "https://tasks.example.test",
  tasksServiceAuthSecret: "tasks-service-secret-that-is-long-enough-too",
};

describe("createDatabaseSubscriptionsRuntimeEffects", () => {
  it("provisions the payment task over an authenticated HTTP call to Tasks", async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        operation: "createGeneratedTask",
        input: { title: "Pay Figma subscription — 2026-08", dueDate: "2026-08-15" },
      });
      const headers = init?.headers as Record<string, string>;
      expect(headers.authorization).toMatch(/^Bearer nts1\./);
      return Response.json({ ok: true, data: { ok: true, taskId: "task-1" } });
    });
    const supabase = { from: vi.fn() } as unknown as SupabaseClient;
    const effects = createDatabaseSubscriptionsRuntimeEffects(supabase, context, tasksEnvironment);
    // Swap in the mock fetch by rebuilding through the module's own factory is
    // not possible without exporting it, so this test exercises the shape via
    // a real fetch stub at the global level instead.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as never;
    try {
      const result = await effects.createGeneratedTask({
        title: "Pay Figma subscription — 2026-08",
        dueDate: "2026-08-15",
      });
      expect(result).toEqual({ ok: true, taskId: "task-1" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("writes domain events attributed to the bound context", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient;
    const effects = createDatabaseSubscriptionsRuntimeEffects(supabase, context, tasksEnvironment);

    await effects.emitDomainEvent({
      eventName: "subscription.payment_cycle.created",
      aggregateType: "subscription_payment_cycle",
      aggregateId: "cycle-1",
      payload: { subscription_id: "sub-1" },
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: context.organizationId,
      workspace_id: context.workspaceId,
      event_name: "subscription.payment_cycle.created",
      created_by: context.actorId,
    }));
  });

  it("links the subscription to the provisioned task", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient;
    const effects = createDatabaseSubscriptionsRuntimeEffects(supabase, context, tasksEnvironment);

    await effects.linkSubscriptionToTask({ subscriptionId: "sub-1", taskId: "task-1", cycleId: "cycle-1" });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      source_type: "subscription",
      source_id: "sub-1",
      target_type: "task",
      target_id: "task-1",
      link_type: "renewal_task",
    }));
  });
});
