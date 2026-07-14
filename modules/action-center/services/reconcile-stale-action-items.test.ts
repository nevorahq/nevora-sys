import { describe, expect, it } from "vitest";
import { reconcileStaleActionItems } from "./reconcile-stale-action-items";
import type { CurrentContext } from "@/lib/context/current-context";

const ctx = { org: { id: "org-1" }, user: { id: "user-1" } } as unknown as CurrentContext;

/**
 * A chainable + thenable Supabase stub. Every filter method returns the same
 * builder, which resolves to the rows configured for its table; `.update()`
 * captures the ids passed to the terminal `.in("id", ...)`.
 */
function makeSupabase(tables: Record<string, unknown[]>) {
  const captured: { closedIds: string[] | null } = { closedIds: null };

  function reader(rows: unknown[]) {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "neq", "in", "order", "limit"]) {
      builder[method] = () => builder;
    }
    (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(resolve);
    return builder;
  }

  function updater() {
    const chain: Record<string, unknown> = {};
    chain.eq = () => chain;
    chain.in = (col: string, vals: string[]) => {
      if (col === "id") captured.closedIds = vals;
      return chain;
    };
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(resolve);
    return chain;
  }

  const supabase = {
    from(table: string) {
      const rows = tables[table] ?? [];
      const api = reader(rows) as Record<string, unknown>;
      api.update = () => updater();
      return api;
    },
  };

  return { supabase, captured };
}

describe("reconcileStaleActionItems", () => {
  it("closes items whose source is terminal and leaves live sources open", async () => {
    const { supabase, captured } = makeSupabase({
      action_items: [
        { id: "i-task", type: "due_soon", source_type: "task", source_id: "task-done" },
        { id: "i-sub", type: "renewal_required", source_type: "subscription", source_id: "sub-live" },
        { id: "i-tx", type: "draft_review", source_type: "transaction", source_id: "tx-posted" },
      ],
      todos: [], // task-done is not live (done/deleted) → i-task stale
      subscriptions: [{ id: "sub-live" }], // still active → i-sub kept
      money_transactions: [{ id: "tx-posted", status: "posted" }], // no longer planned → i-tx stale
    });

    const result = await reconcileStaleActionItems(supabase as never, ctx);

    expect(result.closed).toBe(2);
    expect(captured.closedIds).toContain("i-task");
    expect(captured.closedIds).toContain("i-tx");
    expect(captured.closedIds).not.toContain("i-sub");
  });

  it("keeps a draft_review open while its transaction is still planned", async () => {
    const { supabase, captured } = makeSupabase({
      action_items: [{ id: "i-tx", type: "draft_review", source_type: "transaction", source_id: "tx-1" }],
      money_transactions: [{ id: "tx-1", status: "planned" }],
    });

    const result = await reconcileStaleActionItems(supabase as never, ctx);

    expect(result.closed).toBe(0);
    expect(captured.closedIds).toBeNull();
  });

  it("closes an item whose source row is gone (deleted)", async () => {
    const { supabase, captured } = makeSupabase({
      action_items: [{ id: "i-doc", type: "document_review", source_type: "document", source_id: "doc-gone" }],
      documents: [], // deleted → not found → stale
    });

    const result = await reconcileStaleActionItems(supabase as never, ctx);

    expect(result.closed).toBe(1);
    expect(captured.closedIds).toEqual(["i-doc"]);
  });

  it("no-ops when there are no active items", async () => {
    const { supabase, captured } = makeSupabase({ action_items: [] });
    const result = await reconcileStaleActionItems(supabase as never, ctx);
    expect(result.closed).toBe(0);
    expect(captured.closedIds).toBeNull();
  });
});
