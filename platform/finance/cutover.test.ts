import { describe, expect, it, vi } from "vitest";
import type { FinanceApplication } from "@nevora/finance-api";
import { createCutoverFinanceApplication } from "./cutover";

function application(overrides: Partial<FinanceApplication> = {}): FinanceApplication {
  return {
    context: {
      organizationId: "11111111-1111-4111-8111-111111111111",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      actorId: "33333333-3333-4333-8333-333333333333",
      permissions: ["org.read", "data.write"],
    },
    getAccounts: vi.fn(async () => []),
    findActiveMoneyAccountsByCurrency: vi.fn(async () => ({ ok: true as const, accounts: [] })),
    findDuplicateTransaction: vi.fn(async () => ({ isDuplicate: false, matchedTransactionId: null })),
    createMoneyAccount: vi.fn(async () => ({
      ok: true as const,
      account: { id: "acc-1", name: "Cash", currency: "USD" },
      created: true,
    })),
    ...overrides,
  };
}

describe("Finance staged cutover", () => {
  it("keeps local reads authoritative and compares sampled shadow reads", async () => {
    const local = application({ getAccounts: vi.fn(async () => [{ id: "local" }] as never) });
    const remote = application({ getAccounts: vi.fn(async () => [{ id: "remote" }] as never) });
    const observe = vi.fn();
    const cutover = createCutoverFinanceApplication({ mode: "shadow", local, remote, observe });

    await expect(cutover.getAccounts()).resolves.toEqual([{ id: "local" }]);
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({
      operation: "getAccounts",
      outcome: "mismatched",
    }));
  });

  it("can schedule shadow comparisons after the authoritative response", async () => {
    const local = application({ getAccounts: vi.fn(async () => [{ id: "local" }] as never) });
    const remote = application({ getAccounts: vi.fn(async () => [{ id: "local" }] as never) });
    let scheduled: (() => Promise<void>) | undefined;
    const observe = vi.fn();
    const cutover = createCutoverFinanceApplication({
      mode: "shadow",
      local,
      remote,
      observe,
      scheduleShadow: (callback) => { scheduled = callback; },
    });

    await expect(cutover.getAccounts()).resolves.toEqual([{ id: "local" }]);
    expect(remote.getAccounts).not.toHaveBeenCalled();
    expect(scheduled).toBeTypeOf("function");

    await scheduled?.();
    expect(remote.getAccounts).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({ outcome: "matched" }));
  });

  it("uses remote reads with safe local fallback during read cutover", async () => {
    const local = application({ findDuplicateTransaction: vi.fn(async () => ({ isDuplicate: false, matchedTransactionId: null })) });
    const remote = application({
      findDuplicateTransaction: vi.fn(async () => { throw new Error("timeout"); }),
    });
    const observe = vi.fn();
    const cutover = createCutoverFinanceApplication({ mode: "http-read", local, remote, observe });

    await expect(cutover.findDuplicateTransaction({
      merchantName: "Figma",
      totalAmount: 15,
      currency: "USD",
      transactionDate: "2026-08-15",
    })).resolves.toEqual({ isDuplicate: false, matchedTransactionId: null });
    expect(local.findDuplicateTransaction).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "remote_read_fallback",
    }));
  });

  it("keeps writes local in http-read mode", async () => {
    const local = application();
    const remote = application();
    const cutover = createCutoverFinanceApplication({ mode: "http-read", local, remote });

    await cutover.createMoneyAccount({ name: "Cash", type: "cash", initialBalance: 0, currency: "USD" });
    expect(local.createMoneyAccount).toHaveBeenCalledOnce();
    expect(remote.createMoneyAccount).not.toHaveBeenCalled();
  });

  it("never retries a remote write locally in full HTTP mode", async () => {
    const local = application();
    const remote = application({
      createMoneyAccount: vi.fn(async () => { throw new Error("timeout after commit"); }),
    });
    const cutover = createCutoverFinanceApplication({ mode: "http", local, remote });

    await expect(
      cutover.createMoneyAccount({ name: "Cash", type: "cash", initialBalance: 0, currency: "USD" }),
    ).rejects.toThrow("timeout after commit");
    expect(local.createMoneyAccount).not.toHaveBeenCalled();
  });
});
