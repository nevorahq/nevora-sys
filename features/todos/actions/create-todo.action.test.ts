import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const checkPlanLimit = vi.fn();
const emitDomainEvent = vi.fn();
const emitAuditLog = vi.fn();
const revalidatePath = vi.fn();
const randomUUID = vi.fn();

vi.mock("node:crypto", () => ({ randomUUID }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
vi.mock("@/lib/billing", () => ({ checkPlanLimit }));
vi.mock("@/lib/events", () => ({ emitDomainEvent, emitAuditLog }));
vi.mock("@/shared/i18n/get-dictionary", () => ({
  getDictionary: () =>
    Promise.resolve({
      dict: {
        todos: {
          errors: {
            titleRequired: "Title is required",
            titleMax: "Maximum 200 characters",
            descriptionMax: "Maximum 1000 characters",
            invalidPriority: "Invalid priority",
            createFailed: "Failed to create task",
            serverError: "Something went wrong. Please try again.",
          },
        },
      },
    }),
}));

const { createTodoAction } = await import("./create-todo.action");

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const TASK_ID = "44444444-4444-4444-8444-444444444444";

let insertedTables: string[];
let insertedPayloads: Record<string, Record<string, unknown>>;

/** Minimal supabase fake: task INSERT intentionally has no RETURNING/select. */
function makeSupabase(taskResult: { data: unknown; error: unknown }) {
  const from = vi.fn((table: string) => {
    return {
      insert: vi.fn((payload: Record<string, unknown>) => {
      insertedTables.push(table);
      insertedPayloads[table] = payload;
        return Promise.resolve({ error: taskResult.error });
      }),
    };
  });
  return { from } as never;
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.append(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  insertedTables = [];
  insertedPayloads = {};
  requireOrg.mockResolvedValue({ org: { id: ORG_ID }, workspace: { id: "ws" }, user: { id: USER_ID } });
  checkPlanLimit.mockResolvedValue({ allowed: true });
  emitDomainEvent.mockResolvedValue(undefined);
  emitAuditLog.mockResolvedValue(undefined);
  randomUUID.mockReturnValue(TASK_ID);
  createClient.mockResolvedValue(makeSupabase({ data: { id: TASK_ID }, error: null }));
});

describe("createTodoAction", () => {
  it("creates the task and returns its id without creating a document", async () => {
    const result = await createTodoAction({}, formData({ title: "Call supplier", priority: "medium" }));

    expect(result).toEqual({ taskId: TASK_ID });
    // No document row is created: a file-less task must not appear in Drafts.
    expect(insertedTables).toEqual(["todos"]);
    expect(insertedTables).not.toContain("documents");
    expect(insertedPayloads.todos).toMatchObject({ id: TASK_ID, created_by: USER_ID });
  });

  it("creates a new task with status 'todo' by default", async () => {
    await createTodoAction({}, formData({ title: "Call supplier", priority: "medium" }));

    expect(insertedPayloads.todos).toMatchObject({ status: "todo" });
  });

  it("emits task events only — no document.created when there are no files", async () => {
    await createTodoAction({}, formData({ title: "Call supplier", priority: "medium" }));

    expect(emitDomainEvent).toHaveBeenCalledTimes(1);
    expect(emitDomainEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: "task.created" }));
    expect(emitDomainEvent).not.toHaveBeenCalledWith(expect.objectContaining({ eventName: "document.created" }));
    expect(emitAuditLog).toHaveBeenCalledTimes(1);
    expect(emitAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: "todos" }));
  });

  it("never checks the documents limit (it cannot block a file-less task)", async () => {
    await createTodoAction({}, formData({ title: "Call supplier", priority: "medium" }));

    expect(checkPlanLimit).toHaveBeenCalledTimes(1);
    expect(checkPlanLimit).toHaveBeenCalledWith(ORG_ID, "tasks");
    expect(checkPlanLimit).not.toHaveBeenCalledWith(ORG_ID, "documents");
  });

  it("still creates the task even if the documents quota is exhausted", async () => {
    // Only the tasks metric is consulted; documents is irrelevant here.
    checkPlanLimit.mockImplementation((_org: string, metric: string) =>
      Promise.resolve(metric === "documents" ? { allowed: false, reason: "Document limit reached" } : { allowed: true }),
    );

    const result = await createTodoAction({}, formData({ title: "Call supplier", priority: "medium" }));

    expect(result).toEqual({ taskId: TASK_ID });
    expect(insertedTables).toEqual(["todos"]);
  });

  it("blocks creation when the tasks limit is reached", async () => {
    checkPlanLimit.mockResolvedValue({ allowed: false, reason: "Task limit reached" });

    const result = await createTodoAction({}, formData({ title: "Call supplier", priority: "medium" }));

    expect(result).toEqual({ error: "Task limit reached" });
    expect(createClient).not.toHaveBeenCalled();
  });
});
