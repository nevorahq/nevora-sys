import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
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
vi.mock("@/lib/events", () => ({ emitAuditLog }));

const { updateTaskAction } = await import("./update-task.action");

const ORG_ID  = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const TASK_ID = "44444444-4444-4444-8444-444444444444";

let capturedUpdate: Record<string, unknown> | null;

function makeSupabase(existing: { data: unknown; error: unknown }) {
  capturedUpdate = null;
  const builder: Record<string, unknown> = { _op: null as string | null };
  builder.select = vi.fn(() => { if (!builder._op) builder._op = "select"; return builder; });
  builder.update = vi.fn((p: Record<string, unknown>) => { builder._op = "update"; capturedUpdate = p; return builder; });
  builder.eq = vi.fn(() => builder);
  builder.is = vi.fn(() => builder);
  builder.single = vi.fn(() => Promise.resolve(existing));
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ error: null });
  return { from: vi.fn(() => builder) } as never;
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  fd.append("taskId", TASK_ID);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOrg.mockResolvedValue({ user: { id: USER_ID }, org: { id: ORG_ID } });
  emitAuditLog.mockResolvedValue(undefined);
});

describe("updateTaskAction", () => {
  it("writes only changed fields with updated_by and audits old/new", async () => {
    createClient.mockResolvedValue(makeSupabase({
      data: { title: "Old", description: "", priority: "low", status: "todo", due_date: null },
      error: null,
    }));

    const result = await updateTaskAction({}, formData({ title: "New", description: "", priority: "low", status: "todo" }));

    expect(result).toEqual({});
    // Only the title changed; updated_by is always set.
    expect(capturedUpdate).toEqual({ title: "New", updated_by: USER_ID });
    expect(emitAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "update",
      oldData: { title: "Old" },
      newData: { title: "New" },
    }));
  });

  it("is a no-op (no write, no event) when nothing changed", async () => {
    createClient.mockResolvedValue(makeSupabase({
      data: { title: "Same", description: "d", priority: "medium", status: "todo", due_date: null },
      error: null,
    }));

    const result = await updateTaskAction({}, formData({ title: "Same", description: "d", priority: "medium", status: "todo" }));

    expect(result).toEqual({});
    expect(capturedUpdate).toBeNull();
    expect(emitAuditLog).not.toHaveBeenCalled();
  });

  it("returns not found when the task is inaccessible (RLS)", async () => {
    createClient.mockResolvedValue(makeSupabase({ data: null, error: { code: "PGRST116" } }));

    const result = await updateTaskAction({}, formData({ title: "X" }));

    expect(result).toEqual({ error: "Task not found" });
    expect(capturedUpdate).toBeNull();
  });
});
