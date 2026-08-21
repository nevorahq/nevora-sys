import { describe, expect, it, vi } from "vitest";
import {
  createGeneratedTaskRecord,
  retireGeneratedTasks,
} from "./generated-task-lifecycle";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const ctx = {
  org: { id: ORGANIZATION_ID },
  workspace: { id: WORKSPACE_ID },
  user: { id: USER_ID },
  permissions: new Set(["org.read", "data.write"]),
} as never;

describe("generated task lifecycle", () => {
  it("creates a system task with server-derived tenant attribution", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ insert }));

    const result = await createGeneratedTaskRecord({
      supabase: { from } as never,
      ctx,
      title: "Pay Figma subscription — 2026-08",
      dueDate: "2026-08-15",
    });

    expect(result).toMatchObject({ ok: true });
    expect(from).toHaveBeenCalledWith("todos");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: ORGANIZATION_ID,
      workspace_id: WORKSPACE_ID,
      created_by: USER_ID,
      status: "in_progress",
      due_date: "2026-08-15",
    }));
  });

  it("soft-deletes only the requested organization's generated tasks", async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: "task-1" }], error: null });
    const is = vi.fn(() => ({ select }));
    const eq = vi.fn(() => ({ eq, is }));
    const inIds = vi.fn(() => ({ eq }));
    const update = vi.fn(() => ({ in: inIds }));

    await expect(retireGeneratedTasks({
      supabase: { from: vi.fn(() => ({ update })) } as never,
      ctx,
      taskIds: ["task-1"],
      retiredAt: "2026-08-21T10:00:00.000Z",
    })).resolves.toBe(1);

    expect(inIds).toHaveBeenCalledWith("id", ["task-1"]);
    expect(eq).toHaveBeenCalledWith("organization_id", ORGANIZATION_ID);
    expect(eq).toHaveBeenCalledWith("workspace_id", WORKSPACE_ID);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      deleted_at: "2026-08-21T10:00:00.000Z",
      updated_by: USER_ID,
    }));
  });
});
