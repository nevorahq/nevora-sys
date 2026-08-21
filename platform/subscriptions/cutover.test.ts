import { describe, expect, it, vi } from "vitest";
import type { SubscriptionsApplication } from "@nevora/subscriptions-api";
import { createCutoverSubscriptionsApplication } from "./cutover";

function application(overrides: Partial<SubscriptionsApplication> = {}): SubscriptionsApplication {
  return {
    context: {
      organizationId: "11111111-1111-4111-8111-111111111111",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      actorId: "33333333-3333-4333-8333-333333333333",
      permissions: ["org.read", "data.write"],
    },
    getSubscriptions: vi.fn(async () => []),
    getPaymentCycleByTaskId: vi.fn(async () => null),
    getPaymentCycleByTransactionId: vi.fn(async () => null),
    createSubscriptionPaymentCycle: vi.fn(async () => ({
      ok: true as const,
      cycle: { id: "cycle-1" } as never,
      created: true,
    })),
    createSubscriptionPaymentTaskForCycle: vi.fn(async () => ({
      ok: true as const,
      taskId: "task-1",
      created: true,
    })),
    ...overrides,
  };
}

describe("Subscriptions staged cutover", () => {
  it("keeps local reads authoritative and compares sampled shadow reads", async () => {
    const local = application({ getSubscriptions: vi.fn(async () => [{ id: "local" }] as never) });
    const remote = application({ getSubscriptions: vi.fn(async () => [{ id: "remote" }] as never) });
    const observe = vi.fn();
    const cutover = createCutoverSubscriptionsApplication({ mode: "shadow", local, remote, observe });

    await expect(cutover.getSubscriptions()).resolves.toEqual([{ id: "local" }]);
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({
      operation: "getSubscriptions",
      outcome: "mismatched",
    }));
  });

  it("can schedule shadow comparisons after the authoritative response", async () => {
    const local = application({ getSubscriptions: vi.fn(async () => [{ id: "local" }] as never) });
    const remote = application({ getSubscriptions: vi.fn(async () => [{ id: "local" }] as never) });
    let scheduled: (() => Promise<void>) | undefined;
    const observe = vi.fn();
    const cutover = createCutoverSubscriptionsApplication({
      mode: "shadow",
      local,
      remote,
      observe,
      scheduleShadow: (callback) => { scheduled = callback; },
    });

    await expect(cutover.getSubscriptions()).resolves.toEqual([{ id: "local" }]);
    expect(remote.getSubscriptions).not.toHaveBeenCalled();
    expect(scheduled).toBeTypeOf("function");

    await scheduled?.();
    expect(remote.getSubscriptions).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({ outcome: "matched" }));
  });

  it("uses remote reads with safe local fallback during read cutover", async () => {
    const local = application({ getPaymentCycleByTaskId: vi.fn(async () => null) });
    const remote = application({
      getPaymentCycleByTaskId: vi.fn(async () => { throw new Error("timeout"); }),
    });
    const observe = vi.fn();
    const cutover = createCutoverSubscriptionsApplication({ mode: "http-read", local, remote, observe });

    await expect(cutover.getPaymentCycleByTaskId("task-1")).resolves.toBeNull();
    expect(local.getPaymentCycleByTaskId).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "remote_read_fallback",
    }));
  });

  it("keeps writes local in http-read mode", async () => {
    const local = application();
    const remote = application();
    const cutover = createCutoverSubscriptionsApplication({ mode: "http-read", local, remote });

    await cutover.createSubscriptionPaymentCycle({ subscription: {} as never, dueDate: "2026-08-15" });
    expect(local.createSubscriptionPaymentCycle).toHaveBeenCalledOnce();
    expect(remote.createSubscriptionPaymentCycle).not.toHaveBeenCalled();
  });

  it("never retries a remote write locally in full HTTP mode", async () => {
    const local = application();
    const remote = application({
      createSubscriptionPaymentCycle: vi.fn(async () => { throw new Error("timeout after commit"); }),
    });
    const cutover = createCutoverSubscriptionsApplication({ mode: "http", local, remote });

    await expect(
      cutover.createSubscriptionPaymentCycle({ subscription: {} as never, dueDate: "2026-08-15" }),
    ).rejects.toThrow("timeout after commit");
    expect(local.createSubscriptionPaymentCycle).not.toHaveBeenCalled();
  });
});
