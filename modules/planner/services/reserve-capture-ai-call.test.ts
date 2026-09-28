import { describe, expect, it } from "vitest";
import { reserveCaptureAiCall } from "./reserve-capture-ai-call";
import type { CurrentContext } from "@/lib/context/current-context";

const ctx = { org: { id: "org-1" }, user: { id: "user-1" } } as unknown as CurrentContext;

function makeSupabase(error: { code: string; message: string } | null) {
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const supabase = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row });
          return Promise.resolve({ error });
        },
      };
    },
  };
  return { supabase, inserts };
}

describe("reserveCaptureAiCall", () => {
  it("records one capture_intent call in the org's AI ledger", async () => {
    const { supabase, inserts } = makeSupabase(null);

    await expect(reserveCaptureAiCall(supabase as never, ctx, "entry-1")).resolves.toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("ai_requests");
    expect(inserts[0].row).toMatchObject({
      organization_id: "org-1",
      user_id: "user-1",
      action_type: "capture_intent",
      metadata: { planner_entry_id: "entry-1" },
    });
  });

  it("denies the AI call when the quota trigger rejects the insert", async () => {
    const { supabase } = makeSupabase({ code: "P0001", message: "plan_limit_reached: ai_calls" });
    await expect(reserveCaptureAiCall(supabase as never, ctx, "entry-1")).resolves.toBe(false);
  });

  it("denies the AI call for a write-locked organization", async () => {
    const { supabase } = makeSupabase({ code: "42501", message: "subscription_not_writable" });
    await expect(reserveCaptureAiCall(supabase as never, ctx, "entry-1")).resolves.toBe(false);
  });
});
