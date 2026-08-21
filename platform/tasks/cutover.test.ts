import { describe, expect, it, vi } from "vitest";
import type { TasksApplication } from "@nevora/tasks-api";
import { createCutoverTasksApplication } from "./cutover";

function application(overrides: Partial<TasksApplication> = {}): TasksApplication {
  return {
    context: {
      organizationId: "11111111-1111-4111-8111-111111111111",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      actorId: "33333333-3333-4333-8333-333333333333",
      permissions: ["org.read", "data.write"],
    },
    getTask: vi.fn(async () => null),
    listTasks: vi.fn(async () => []),
    createStandardTask: vi.fn(async () => ({ ok: true as const, taskId: "task-1", created: true })),
    createGeneratedTask: vi.fn(async () => ({ ok: true as const, taskId: "task-1" })),
    updateGeneratedTaskDueDate: vi.fn(async () => true),
    retireGeneratedTasks: vi.fn(async () => 1),
    ...overrides,
  };
}

describe("Tasks staged cutover", () => {
  it("keeps local reads authoritative and compares sampled shadow reads", async () => {
    const local = application({ listTasks: vi.fn(async () => [{ id: "local" }] as never) });
    const remote = application({ listTasks: vi.fn(async () => [{ id: "remote" }] as never) });
    const observe = vi.fn();
    const cutover = createCutoverTasksApplication({ mode: "shadow", local, remote, observe });

    await expect(cutover.listTasks()).resolves.toEqual([{ id: "local" }]);
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({
      operation: "listTasks",
      outcome: "mismatched",
    }));
  });

  it("can schedule shadow comparisons after the authoritative response", async () => {
    const local = application({ listTasks: vi.fn(async () => [{ id: "local" }] as never) });
    const remote = application({ listTasks: vi.fn(async () => [{ id: "local" }] as never) });
    let scheduled: (() => Promise<void>) | undefined;
    const observe = vi.fn();
    const cutover = createCutoverTasksApplication({
      mode: "shadow",
      local,
      remote,
      observe,
      scheduleShadow: (callback) => { scheduled = callback; },
    });

    await expect(cutover.listTasks()).resolves.toEqual([{ id: "local" }]);
    expect(remote.listTasks).not.toHaveBeenCalled();
    expect(scheduled).toBeTypeOf("function");

    await scheduled?.();
    expect(remote.listTasks).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({ outcome: "matched" }));
  });

  it("uses remote reads with safe local fallback during read cutover", async () => {
    const local = application({ getTask: vi.fn(async () => null) });
    const remote = application({ getTask: vi.fn(async () => { throw new Error("timeout"); }) });
    const observe = vi.fn();
    const cutover = createCutoverTasksApplication({ mode: "http-read", local, remote, observe });

    await expect(cutover.getTask("task-1")).resolves.toBeNull();
    expect(local.getTask).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "remote_read_fallback",
    }));
  });

  it("keeps writes local in http-read mode", async () => {
    const local = application();
    const remote = application();
    const cutover = createCutoverTasksApplication({ mode: "http-read", local, remote });

    await cutover.createStandardTask({ title: "Prepare report" });
    expect(local.createStandardTask).toHaveBeenCalledOnce();
    expect(remote.createStandardTask).not.toHaveBeenCalled();
  });

  it("never retries a remote write locally in full HTTP mode", async () => {
    const local = application();
    const remote = application({
      createStandardTask: vi.fn(async () => { throw new Error("timeout after commit"); }),
    });
    const cutover = createCutoverTasksApplication({ mode: "http", local, remote });

    await expect(cutover.createStandardTask({ title: "Prepare report" })).rejects.toThrow(
      "timeout after commit",
    );
    expect(local.createStandardTask).not.toHaveBeenCalled();
  });
});
