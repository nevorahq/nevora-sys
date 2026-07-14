import { describe, expect, it } from "vitest";
import { markDocumentPlannerEntry } from "./mark-document-planner-entry";
import type { CurrentContext } from "@/lib/context/current-context";

const ctx = { org: { id: "org-1" }, user: { id: "user-1" } } as unknown as CurrentContext;

/** Captures the update payload and every filter applied to it. */
function makeSupabase() {
  const calls: { table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }[] = [];

  const supabase = {
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          const filters: Record<string, unknown> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (col: string, val: unknown) => {
            filters[col] = val;
            return chain;
          };
          chain.in = (col: string, vals: unknown) => {
            filters[col] = vals;
            return chain;
          };
          (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => {
            calls.push({ table, patch, filters });
            return Promise.resolve({ error: null }).then(resolve);
          };
          return chain;
        },
      };
    },
  };

  return { supabase, calls };
}

describe("markDocumentPlannerEntry", () => {
  it("advances the capture sourced from the document, scoped to the org", async () => {
    const { supabase, calls } = makeSupabase();

    await markDocumentPlannerEntry(supabase as never, ctx, "doc-1", "suggested");

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("planner_entries");
    expect(calls[0].patch).toMatchObject({ status: "suggested" });
    expect(calls[0].filters.organization_id).toBe("org-1");
    expect(calls[0].filters.source_document_id).toBe("doc-1");
  });

  /**
   * The guard that makes this safe to call from an async extraction callback: a
   * capture the user already accepted or rejected must never be dragged back into
   * "suggested" by a late-arriving sweep.
   */
  it("only moves captures that are still non-terminal", async () => {
    const { supabase, calls } = makeSupabase();

    await markDocumentPlannerEntry(supabase as never, ctx, "doc-1", "accepted");

    expect(calls[0].filters.status).toEqual(["captured", "processing", "suggested"]);
  });

  it("records the terminal state a confirmed review produces", async () => {
    const { supabase, calls } = makeSupabase();

    await markDocumentPlannerEntry(supabase as never, ctx, "doc-9", "accepted");

    expect(calls[0].patch).toMatchObject({ status: "accepted" });
    expect(calls[0].filters.source_document_id).toBe("doc-9");
  });
});
