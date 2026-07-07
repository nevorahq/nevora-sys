import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const canDo = vi.fn();
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
vi.mock("@/lib/context/current-context", () => ({ canDo }));
vi.mock("@/lib/events", () => ({ emitDomainEvent, emitAuditLog }));

const { assignTaskAction, unassignTaskAction } = await import("./assign-task.action");

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "33333333-3333-4333-8333-333333333333";
const TASK_ID = "44444444-4444-4444-8444-444444444444";
const MEMBER_ID = "55555555-5555-4555-8555-555555555555";

function chain(singleResult?: unknown) {
  const builder: Record<string, unknown> = { error: null };
  builder.select = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.is = vi.fn(() => builder);
  builder.single = vi.fn(() => Promise.resolve(singleResult));
  return builder;
}

function makeSupabase(options: {
  inserted?: unknown[];
  rpcResult?: unknown;
  task?: unknown;
  membership?: unknown;
}) {
  const task = chain(options.task ?? { data: { id: TASK_ID, title: "Task", created_by: ACTOR_ID }, error: null });
  const membership = chain("membership" in options ? options.membership : { data: { id: "membership" }, error: null });
  const touch = chain();
  let todosCalls = 0;
  const assignees = {
    upsert: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: options.inserted ?? [{ id: "assignment" }], error: null })),
    })),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "todos") return todosCalls++ === 0 ? task : touch;
      if (table === "memberships") return membership;
      if (table === "task_assignees") return assignees;
      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: vi.fn(() => Promise.resolve({ data: options.rpcResult, error: null })),
    assignees,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOrg.mockResolvedValue({
    user: { id: ACTOR_ID },
    org: { id: ORG_ID },
    permissions: new Set(["data.delete"]),
  });
  canDo.mockReturnValue(true);
  emitDomainEvent.mockResolvedValue(undefined);
  emitAuditLog.mockResolvedValue(undefined);
});

describe("assignTaskAction", () => {
  it("adds an assignee and records who added whom", async () => {
    const supabase = makeSupabase({});
    createClient.mockResolvedValue(supabase);

    await expect(assignTaskAction(TASK_ID, MEMBER_ID)).resolves.toEqual({});

    expect(supabase.assignees.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: TASK_ID, user_id: MEMBER_ID, assigned_by: ACTOR_ID }),
      expect.objectContaining({ ignoreDuplicates: true }),
    );
    expect(emitAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "assign",
      newData: { assignee_id: MEMBER_ID },
    }));
  });

  it("does not create duplicate activity for an existing assignment", async () => {
    createClient.mockResolvedValue(makeSupabase({ inserted: [] }));

    await expect(assignTaskAction(TASK_ID, MEMBER_ID)).resolves.toEqual({});

    expect(emitDomainEvent).not.toHaveBeenCalled();
    expect(emitAuditLog).not.toHaveBeenCalled();
  });

  it("emits the task.assigned domain event on a fresh assignment", async () => {
    createClient.mockResolvedValue(makeSupabase({}));

    await assignTaskAction(TASK_ID, MEMBER_ID);

    expect(emitDomainEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventName: "task.assigned",
      payload: expect.objectContaining({ assignee_id: MEMBER_ID }),
    }));
  });

  it("can assign several distinct members additively (one upsert each)", async () => {
    const second = "66666666-6666-4666-8666-666666666666";
    const s1 = makeSupabase({});
    const s2 = makeSupabase({});
    createClient.mockResolvedValueOnce(s1).mockResolvedValueOnce(s2);

    await assignTaskAction(TASK_ID, MEMBER_ID);
    await assignTaskAction(TASK_ID, second);

    // Each call adds its own assignee without touching the others (upsert, not replace).
    expect(s1.assignees.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: MEMBER_ID }),
      expect.objectContaining({ ignoreDuplicates: true }),
    );
    expect(s2.assignees.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: second }),
      expect.objectContaining({ ignoreDuplicates: true }),
    );
  });

  it("rejects a target who is not an active member (invited/suspended/other org)", async () => {
    const supabase = makeSupabase({ membership: { data: null, error: null } });
    createClient.mockResolvedValue(supabase);

    const result = await assignTaskAction(TASK_ID, MEMBER_ID);

    expect(result.error).toBeTruthy();
    expect(supabase.assignees.upsert).not.toHaveBeenCalled();
  });

  it("rejects an initiator who can neither manage nor own the task", async () => {
    canDo.mockReturnValue(false); // not a manager
    const supabase = makeSupabase({
      task: { data: { id: TASK_ID, title: "Task", created_by: MEMBER_ID }, error: null }, // someone else's task
    });
    createClient.mockResolvedValue(supabase);

    const result = await assignTaskAction(TASK_ID, MEMBER_ID);

    expect(result.error).toBeTruthy();
    expect(supabase.assignees.upsert).not.toHaveBeenCalled();
  });

  it("rejects invalid ids before touching the database", async () => {
    const result = await assignTaskAction("not-a-uuid", MEMBER_ID);
    expect(result.error).toBeTruthy();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("maps the database invariant when removing the last assignee", async () => {
    createClient.mockResolvedValue(makeSupabase({ rpcResult: { ok: false, error: "last_assignee" } }));

    await expect(unassignTaskAction(TASK_ID, ACTOR_ID)).resolves.toEqual({
      error: "A task must have at least one assignee",
    });
    expect(emitAuditLog).not.toHaveBeenCalled();
  });
});

describe("unassignTaskAction", () => {
  it("removes an assignee via the RPC and emits task.unassigned + audit", async () => {
    const supabase = makeSupabase({ rpcResult: { ok: true, deleted: 1 } });
    createClient.mockResolvedValue(supabase);

    const result = await unassignTaskAction(TASK_ID, MEMBER_ID);

    expect(result).toEqual({});
    expect(supabase.rpc).toHaveBeenCalledWith(
      "remove_task_assignee",
      { p_task_id: TASK_ID, p_user_id: MEMBER_ID },
    );
    expect(emitDomainEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "task.unassigned" }));
    expect(emitAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "unassign",
      oldData: { assignee_id: MEMBER_ID },
    }));
  });

  it("lets an assignee remove themselves (self-removal)", async () => {
    const supabase = makeSupabase({ rpcResult: { ok: true, deleted: 1 } });
    createClient.mockResolvedValue(supabase);

    await expect(unassignTaskAction(TASK_ID, ACTOR_ID)).resolves.toEqual({});
  });

  it("maps a forbidden RPC result to a permission error and emits nothing", async () => {
    createClient.mockResolvedValue(makeSupabase({ rpcResult: { ok: false, error: "forbidden" } }));

    const result = await unassignTaskAction(TASK_ID, MEMBER_ID);

    expect(result.error).toBeTruthy();
    expect(emitDomainEvent).not.toHaveBeenCalled();
    expect(emitAuditLog).not.toHaveBeenCalled();
  });
});
