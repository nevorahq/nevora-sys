import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordTaskDeletionInActionCenter } from "./record-task-deletion";
import type { CurrentContext } from "@/lib/context/current-context";

const publish = vi.hoisted(() => vi.fn());

vi.mock("./action-event-publisher", () => ({
  publishActionItemEvent: publish,
}));

const ctx = {
  org: { id: "org-a", name: "Org", slug: "org-a", plan: "free", baseCurrency: "EUR" },
  workspace: { id: "workspace-a", name: "Main" },
  user: { id: "user-a", email: "user@example.test" },
  membership: { id: "member-a", organizationId: "org-a", userId: "user-a", role: "admin", status: "active" },
  permissions: new Set<string>(),
} as unknown as CurrentContext;

describe("recordTaskDeletionInActionCenter", () => {
  it("creates a resolved Action Center history item when the deleted task had no existing action", async () => {
    publish.mockClear();
    const supabase = makeSupabase([
      { data: [] },
      { data: { id: "action-a" } },
    ]);

    await recordTaskDeletionInActionCenter(supabase as unknown as SupabaseClient, ctx, {
      taskId: "task-a",
      title: "Call client",
    });

    expect(supabase.calls[1]).toMatchObject({
      table: "action_items",
      op: "insert",
      payload: expect.objectContaining({
        title: "Deleted task: Call client",
        status: "resolved",
        source_type: "task",
        source_id: "task-a",
        // The card renders the "Deleted" marker off this flag.
        metadata: expect.objectContaining({ task_deleted: true, source: "task_delete" }),
      }),
    });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      actionItemId: "action-a",
      eventName: "action_item.executed",
      newStatus: "resolved",
      payload: expect.objectContaining({ action: "delete_task" }),
    }));
  });

  it("resolves existing active task actions AND stamps the deletion marker", async () => {
    publish.mockClear();
    const supabase = makeSupabase([
      { data: [{ id: "action-a", status: "open", metadata: { keep: "me" } }] },
      { data: null },
    ]);

    await recordTaskDeletionInActionCenter(supabase as unknown as SupabaseClient, ctx, {
      taskId: "task-a",
      title: "Call client",
    });

    expect(supabase.calls.some((call) => call.op === "insert")).toBe(false);
    expect(supabase.calls[1]).toMatchObject({
      table: "action_items",
      op: "update",
      payload: expect.objectContaining({
        status: "resolved",
        // Marker merged into existing metadata (existing keys preserved).
        metadata: expect.objectContaining({ keep: "me", task_deleted: true, source: "task_delete" }),
      }),
    });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      actionItemId: "action-a",
      oldStatus: "open",
      newStatus: "resolved",
      payload: expect.objectContaining({ action: "delete_task" }),
    }));
  });
});

type QueryResult = { data: unknown; error?: { message: string } | null };
type RecordedCall = { table: string; op?: string; payload?: unknown; filters: unknown[] };
type FakeSupabase = {
  calls: RecordedCall[];
  from(table: string): unknown;
};

function makeSupabase(results: QueryResult[]): FakeSupabase {
  const calls: RecordedCall[] = [];
  return {
    calls,
    from(table: string) {
      const call: RecordedCall = { table, filters: [] };
      calls.push(call);
      const result = results.shift() ?? { data: null };
      const query = {
        select(_columns?: string) {
          call.op ??= "select";
          return query;
        },
        insert(payload: unknown) {
          call.op = "insert";
          call.payload = payload;
          return query;
        },
        update(payload: unknown) {
          call.op = "update";
          call.payload = payload;
          return query;
        },
        eq(column: string, value: unknown) {
          call.filters.push(["eq", column, value]);
          return query;
        },
        in(column: string, value: unknown) {
          call.filters.push(["in", column, value]);
          return query;
        },
        single() {
          return query;
        },
        then(resolve: (value: QueryResult) => void) {
          resolve({ data: result.data, error: result.error ?? null });
        },
      };
      return query;
    },
  };
}
