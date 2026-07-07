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

const { updateTaskDueDateAction } = await import("./update-task-due-date.action");

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const WS_ID = "55555555-5555-4555-8555-555555555555";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const TASK_ID = "44444444-4444-4444-8444-444444444444";

let capturedUpdate: Record<string, unknown> | null;
let capturedInsert: Record<string, unknown> | null;

/**
 * Supabase fake routed by table name.
 *   todos:                 .select().eq().eq().is().single() → fetchResult
 *                          .update(payload).eq().eq().is()    → updateResult (awaited)
 *   task_due_date_changes: .insert(payload)                   → insertResult (awaited)
 */
function makeSupabase(opts: {
  fetchResult: { data: unknown; error: unknown };
  updateResult?: { error: unknown };
  insertResult?: { error: unknown };
}) {
  const updateResult = opts.updateResult ?? { error: null };
  const insertResult = opts.insertResult ?? { error: null };

  function builder(table: string): Record<string, unknown> {
    const b: Record<string, unknown> = {};
    let pending: { error: unknown } = { error: null };
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.is = vi.fn(() => b);
    b.single = vi.fn(() => Promise.resolve(opts.fetchResult));
    b.update = vi.fn((payload: Record<string, unknown>) => {
      capturedUpdate = payload;
      pending = updateResult;
      return b;
    });
    b.insert = vi.fn((payload: Record<string, unknown>) => {
      capturedInsert = payload;
      pending = insertResult;
      return b;
    });
    b.then = (resolve: (v: unknown) => unknown) => resolve(pending);
    void table;
    return b;
  }

  return { from: vi.fn((table: string) => builder(table)) } as never;
}

function input(overrides: Partial<{ taskId: string; newDueDate: string; reason: string }> = {}) {
  return { taskId: TASK_ID, newDueDate: "2026-08-01", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedUpdate = null;
  capturedInsert = null;
  requireOrg.mockResolvedValue({
    org: { id: ORG_ID },
    user: { id: USER_ID },
    workspace: { id: WS_ID },
    permissions: new Set(["data.write"]),
  });
  emitDomainEvent.mockResolvedValue(undefined);
  emitAuditLog.mockResolvedValue(undefined);
});

describe("updateTaskDueDateAction", () => {
  it("changes the due date and persists the new value", async () => {
    createClient.mockResolvedValue(
      makeSupabase({ fetchResult: { data: { id: TASK_ID, title: "T", status: "in_progress", due_date: "2026-07-10" }, error: null } }),
    );

    const result = await updateTaskDueDateAction(input({ newDueDate: "2026-08-01", reason: "client asked" }));

    expect(result).toEqual({});
    expect(capturedUpdate).toMatchObject({ due_date: "2026-08-01", updated_by: USER_ID });
  });

  it("stores old/new date, change_type and reason in history", async () => {
    createClient.mockResolvedValue(
      makeSupabase({ fetchResult: { data: { id: TASK_ID, title: "T", status: "in_progress", due_date: "2026-07-10" }, error: null } }),
    );

    await updateTaskDueDateAction(input({ newDueDate: "2026-08-01", reason: "  client asked  " }));

    expect(capturedInsert).toMatchObject({
      organization_id: ORG_ID,
      workspace_id: WS_ID,
      task_id: TASK_ID,
      old_due_date: "2026-07-10",
      new_due_date: "2026-08-01",
      change_type: "extended",
      reason: "client asked",
      changed_by: USER_ID,
    });
  });

  it("classifies 'set' when the task had no due date", async () => {
    createClient.mockResolvedValue(
      makeSupabase({ fetchResult: { data: { id: TASK_ID, title: "T", status: "in_progress", due_date: null }, error: null } }),
    );
    await updateTaskDueDateAction(input({ newDueDate: "2026-08-01" }));
    expect(capturedInsert).toMatchObject({ change_type: "set", old_due_date: null });
  });

  it("classifies 'shortened' when the new date is earlier", async () => {
    createClient.mockResolvedValue(
      makeSupabase({ fetchResult: { data: { id: TASK_ID, title: "T", status: "in_progress", due_date: "2026-07-10" }, error: null } }),
    );
    await updateTaskDueDateAction(input({ newDueDate: "2026-07-01" }));
    expect(capturedInsert).toMatchObject({ change_type: "shortened" });
  });

  it("emits task.due_date_changed and an audit log", async () => {
    createClient.mockResolvedValue(
      makeSupabase({ fetchResult: { data: { id: TASK_ID, title: "T", status: "in_progress", due_date: "2026-07-10" }, error: null } }),
    );
    await updateTaskDueDateAction(input({ newDueDate: "2026-08-01" }));

    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "task.due_date_changed",
        payload: expect.objectContaining({ old_due_date: "2026-07-10", new_due_date: "2026-08-01", change_type: "extended" }),
      }),
    );
    expect(emitAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "update",
        oldData: { due_date: "2026-07-10" },
        newData: expect.objectContaining({ due_date: "2026-08-01", change_type: "extended" }),
      }),
    );
  });

  it("rejects an invalid task id without touching the DB", async () => {
    const result = await updateTaskDueDateAction(input({ taskId: "not-a-uuid" }));
    expect(result.error).toBeTruthy();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects an invalid calendar date", async () => {
    const result = await updateTaskDueDateAction(input({ newDueDate: "2026-02-31" }));
    expect(result.error).toBeTruthy();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects the same date as a no-op (no history, no event)", async () => {
    createClient.mockResolvedValue(
      makeSupabase({ fetchResult: { data: { id: TASK_ID, title: "T", status: "in_progress", due_date: "2026-08-01" }, error: null } }),
    );
    const result = await updateTaskDueDateAction(input({ newDueDate: "2026-08-01" }));
    expect(result.error).toBeTruthy();
    expect(capturedUpdate).toBeNull();
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });

  it("cannot change a task from another organization", async () => {
    createClient.mockResolvedValue(
      makeSupabase({ fetchResult: { data: null, error: { code: "PGRST116" } } }),
    );
    const result = await updateTaskDueDateAction(input());
    expect(result).toEqual({ error: "Task not found" });
    expect(capturedUpdate).toBeNull();
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });

  it("blocks setting a due date on a task that is not in progress (todo)", async () => {
    createClient.mockResolvedValue(
      makeSupabase({ fetchResult: { data: { id: TASK_ID, title: "T", status: "todo", due_date: null }, error: null } }),
    );
    const result = await updateTaskDueDateAction(input({ newDueDate: "2026-08-01" }));
    expect(result.error).toBeTruthy();
    expect(capturedUpdate).toBeNull();
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });

  it("blocks changing a closed (done) task", async () => {
    createClient.mockResolvedValue(
      makeSupabase({ fetchResult: { data: { id: TASK_ID, title: "T", status: "done", due_date: "2026-07-10" }, error: null } }),
    );
    const result = await updateTaskDueDateAction(input({ newDueDate: "2026-08-01" }));
    expect(result.error).toBeTruthy();
    expect(capturedUpdate).toBeNull();
  });

  it("rejects when the user lacks data.write", async () => {
    requireOrg.mockResolvedValue({
      org: { id: ORG_ID },
      user: { id: USER_ID },
      workspace: { id: WS_ID },
      permissions: new Set<string>(),
    });
    const result = await updateTaskDueDateAction(input());
    expect(result.error).toBeTruthy();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects a too-long reason", async () => {
    const result = await updateTaskDueDateAction(input({ reason: "x".repeat(501) }));
    expect(result.error).toBeTruthy();
    expect(createClient).not.toHaveBeenCalled();
  });
});
