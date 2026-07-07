import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const emitDomainEvent = vi.fn();
const emitAuditLog = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
// Phase 2: actions now funnel through requireAppAccess; mock that boundary and
// delegate to the existing requireOrg fixture (the guard has its own tests).
vi.mock("@/lib/security", () => ({
  requireAppAccess: () => requireOrg(),
  accessErrorToActionResult: () => null,
  isAccessError: () => false,
}));
vi.mock("@/lib/events", () => ({ emitDomainEvent, emitAuditLog }));

const { changeTaskStatusAction } = await import("./change-task-status.action");

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const TASK_ID = "44444444-4444-4444-8444-444444444444";

let capturedUpdate: Record<string, unknown> | null;

/**
 * Minimal supabase fake covering both chains used by the action:
 *   .from("todos").select(...).eq().eq().is().single()  → fetchResult
 *   .from("todos").update(payload).eq().eq()            → updateResult (awaited)
 */
function makeSupabase(opts: {
  fetchResult: { data: unknown; error: unknown };
  updateResult?: { error: unknown };
}) {
  const updateResult = opts.updateResult ?? { error: null };
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.update = vi.fn((payload: Record<string, unknown>) => {
    capturedUpdate = payload;
    return builder;
  });
  builder.eq = vi.fn(() => builder);
  builder.is = vi.fn(() => builder);
  builder.single = vi.fn(() => Promise.resolve(opts.fetchResult));
  // Only the update chain is awaited directly (thenable).
  builder.then = (resolve: (v: unknown) => unknown) => resolve(updateResult);
  return { from: vi.fn(() => builder), __builder: builder } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedUpdate = null;
  requireOrg.mockResolvedValue({ org: { id: ORG_ID }, user: { id: USER_ID } });
  emitDomainEvent.mockResolvedValue(undefined);
  emitAuditLog.mockResolvedValue(undefined);
});

describe("changeTaskStatusAction", () => {
  it("changes the status from the card and persists the new value", async () => {
    createClient.mockResolvedValue(
      makeSupabase({ fetchResult: { data: { id: TASK_ID, title: "T", status: "todo" }, error: null } }),
    );

    const result = await changeTaskStatusAction(TASK_ID, "in_progress");

    expect(result).toEqual({});
    expect(capturedUpdate).toMatchObject({ status: "in_progress", updated_by: USER_ID });
  });

  it("syncs is_completed: done → true, others → false", async () => {
    createClient.mockResolvedValue(
      makeSupabase({ fetchResult: { data: { id: TASK_ID, title: "T", status: "todo" }, error: null } }),
    );
    await changeTaskStatusAction(TASK_ID, "done");
    expect(capturedUpdate).toMatchObject({ status: "done", is_completed: true });

    createClient.mockResolvedValue(
      makeSupabase({ fetchResult: { data: { id: TASK_ID, title: "T", status: "done" }, error: null } }),
    );
    await changeTaskStatusAction(TASK_ID, "in_progress");
    expect(capturedUpdate).toMatchObject({ status: "in_progress", is_completed: false });
  });

  it("emits task.completed when moving to done, task.updated otherwise", async () => {
    createClient.mockResolvedValue(
      makeSupabase({ fetchResult: { data: { id: TASK_ID, title: "T", status: "todo" }, error: null } }),
    );
    await changeTaskStatusAction(TASK_ID, "done");
    expect(emitDomainEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "task.completed" }));

    vi.clearAllMocks();
    requireOrg.mockResolvedValue({ org: { id: ORG_ID }, user: { id: USER_ID } });
    createClient.mockResolvedValue(
      makeSupabase({ fetchResult: { data: { id: TASK_ID, title: "T", status: "todo" }, error: null } }),
    );
    await changeTaskStatusAction(TASK_ID, "in_progress");
    expect(emitDomainEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "task.updated" }));
  });

  it("writes an audit log with old and new status", async () => {
    createClient.mockResolvedValue(
      makeSupabase({ fetchResult: { data: { id: TASK_ID, title: "T", status: "todo" }, error: null } }),
    );
    await changeTaskStatusAction(TASK_ID, "in_progress");
    expect(emitAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "status_change",
        oldData: { status: "todo" },
        newData: { status: "in_progress" },
      }),
    );
  });

  it("rejects unknown / legacy statuses (in_review, cancelled, garbage)", async () => {
    const supabase = makeSupabase({ fetchResult: { data: null, error: null } });
    createClient.mockResolvedValue(supabase);

    for (const bad of ["in_review", "cancelled", "archived", ""]) {
      const result = await changeTaskStatusAction(TASK_ID, bad as never);
      expect(result.error).toBeTruthy();
    }
    // Never reached the DB.
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects an invalid task id without touching the DB", async () => {
    const result = await changeTaskStatusAction("not-a-uuid", "done");
    expect(result.error).toBeTruthy();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("cannot change a task from another organization", async () => {
    // Fetch is scoped by organization_id; a foreign task returns no row.
    const supabase = makeSupabase({ fetchResult: { data: null, error: { code: "PGRST116" } } });
    createClient.mockResolvedValue(supabase);

    const result = await changeTaskStatusAction(TASK_ID, "done");

    expect(result).toEqual({ error: "Task not found" });
    expect(capturedUpdate).toBeNull();
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });

  it("is a no-op when the status is unchanged", async () => {
    createClient.mockResolvedValue(
      makeSupabase({ fetchResult: { data: { id: TASK_ID, title: "T", status: "done" }, error: null } }),
    );
    const result = await changeTaskStatusAction(TASK_ID, "done");
    expect(result).toEqual({});
    expect(capturedUpdate).toBeNull();
  });
});
