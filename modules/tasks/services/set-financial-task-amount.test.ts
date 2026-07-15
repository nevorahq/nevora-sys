import { describe, expect, it, vi } from "vitest";
import { setFinancialTaskAmount } from "./set-financial-task-amount";
import type { CurrentContext } from "@/lib/context/current-context";

vi.mock("@/lib/events", () => ({
  emitDomainEvent: vi.fn(async () => undefined),
  emitAuditLog: vi.fn(async () => undefined),
}));

const ctx = {
  org: { id: "org-1" },
  workspace: { id: "ws-1" },
  user: { id: "user-1" },
} as unknown as CurrentContext;

/** Supabase stub: one `todos` row for select, capturing the update payload. */
function makeSupabase(taskRow: Record<string, unknown> | null) {
  const captured: { patch: Record<string, unknown> | null; filters: Record<string, unknown> } = {
    patch: null,
    filters: {},
  };

  const supabase = {
    from() {
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is"]) builder[m] = () => builder;
      builder.maybeSingle = () => Promise.resolve({ data: taskRow, error: null });
      builder.update = (patch: Record<string, unknown>) => {
        captured.patch = patch;
        const chain: Record<string, unknown> = {};
        chain.eq = (col: string, val: unknown) => {
          captured.filters[col] = val;
          return chain;
        };
        (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(resolve);
        return chain;
      };
      return builder;
    },
  };

  return { supabase, captured };
}

const openTask = {
  id: "task-1",
  task_context_type: "invoice_payment",
  financial_source_type: "manual",
  financial_status: "open",
  amount: null,
  currency: null,
  workspace_id: "ws-1",
};

describe("setFinancialTaskAmount", () => {
  it("sets amount + currency on an open amountless financial task (no money posted)", async () => {
    const { supabase, captured } = makeSupabase(openTask);

    const res = await setFinancialTaskAmount({ supabase: supabase as never, ctx, taskId: "task-1", amount: 400, currency: "EUR" });

    expect(res.ok).toBe(true);
    expect(captured.patch).toMatchObject({ amount: 400, currency: "EUR" });
    // Guarded to open rows so a paid task's amount (which backs a posted expense)
    // can never be moved from under it.
    expect(captured.filters.financial_status).toBe("open");
  });

  it("refuses a task that is not financial", async () => {
    const { supabase } = makeSupabase({ ...openTask, task_context_type: "standard" });
    const res = await setFinancialTaskAmount({ supabase: supabase as never, ctx, taskId: "task-1", amount: 400, currency: "EUR" });
    expect(res).toEqual({ ok: false, error: "This is not a financial task" });
  });

  it("refuses a subscription payment cycle (priced by its own workflow)", async () => {
    const { supabase } = makeSupabase({ ...openTask, financial_source_type: "subscription_payment_cycle" });
    const res = await setFinancialTaskAmount({ supabase: supabase as never, ctx, taskId: "task-1", amount: 400, currency: "EUR" });
    expect(res.ok).toBe(false);
  });

  it("refuses an already-paid task (its amount is immutable)", async () => {
    const { supabase } = makeSupabase({ ...openTask, financial_status: "paid" });
    const res = await setFinancialTaskAmount({ supabase: supabase as never, ctx, taskId: "task-1", amount: 400, currency: "EUR" });
    expect(res).toEqual({ ok: false, error: "This task can no longer be edited" });
  });

  it("returns an error when the task is not found", async () => {
    const { supabase } = makeSupabase(null);
    const res = await setFinancialTaskAmount({ supabase: supabase as never, ctx, taskId: "missing", amount: 400, currency: "EUR" });
    expect(res).toEqual({ ok: false, error: "Financial task not found" });
  });
});
