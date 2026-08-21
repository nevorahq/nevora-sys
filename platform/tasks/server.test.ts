import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentContext } from "@/lib/context/current-context";

const requestHeaders = vi.fn(async () => new Headers({
  cookie: "sb-session=secret",
  host: "app.example.test",
  "x-forwarded-proto": "https",
}));

vi.mock("next/headers", () => ({ headers: requestHeaders }));
vi.mock("next/server", () => ({ after: vi.fn() }));

const getTaskById = vi.fn();
const getTasks = vi.fn();
const createStandardTask = vi.fn();
const createGeneratedTaskRecord = vi.fn();
const updateGeneratedTaskDueDate = vi.fn();
const retireGeneratedTasks = vi.fn();

vi.mock("@/modules/tasks/server", () => ({
  getTaskById,
  getTasks,
  createStandardTask,
  createGeneratedTaskRecord,
  updateGeneratedTaskDueDate,
  retireGeneratedTasks,
}));

const {
  createInProcessTasksApplication,
  getTasksApplication,
  resolveTasksShadowReadPercent,
  resolveTasksTransportMode,
} = await import("./server");

const currentContext = {
  org: { id: "org-1" },
  workspace: { id: "workspace-1" },
  user: { id: "user-1" },
  permissions: new Set(["data.read", "data.write"]),
} as unknown as CurrentContext;
const supabase = { marker: "client" } as never;

const previousTransport = process.env.TASKS_TRANSPORT;
const previousApiUrl = process.env.TASKS_API_URL;
const previousServiceSecret = process.env.TASKS_SERVICE_AUTH_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.TASKS_TRANSPORT;
  delete process.env.TASKS_API_URL;
  delete process.env.TASKS_SERVICE_AUTH_SECRET;
});

afterAll(() => {
  if (previousTransport === undefined) delete process.env.TASKS_TRANSPORT;
  else process.env.TASKS_TRANSPORT = previousTransport;
  if (previousApiUrl === undefined) delete process.env.TASKS_API_URL;
  else process.env.TASKS_API_URL = previousApiUrl;
  if (previousServiceSecret === undefined) delete process.env.TASKS_SERVICE_AUTH_SECRET;
  else process.env.TASKS_SERVICE_AUTH_SECRET = previousServiceSecret;
});

describe("createInProcessTasksApplication", () => {
  it("binds trusted tenant identity once", () => {
    const application = createInProcessTasksApplication({ supabase, currentContext });

    expect(application.context).toEqual({
      organizationId: "org-1",
      workspaceId: "workspace-1",
      actorId: "user-1",
      permissions: ["data.read", "data.write"],
    });
    expect(Object.isFrozen(application.context)).toBe(true);
  });

  it("pins reads to the authenticated organization", async () => {
    const application = createInProcessTasksApplication({ supabase, currentContext });
    await application.getTask("task-1");
    await application.listTasks({ limit: 20 });

    expect(getTaskById).toHaveBeenCalledWith("org-1", "task-1", supabase);
    expect(getTasks).toHaveBeenCalledWith(
      "org-1",
      { limit: 20, workspaceId: "workspace-1" },
      supabase,
    );
  });

  it("injects infrastructure into mutations without exposing it in the API", async () => {
    const application = createInProcessTasksApplication({ supabase, currentContext });
    const input = { title: "Prepare report", dueDate: "2026-09-01" };
    await application.createGeneratedTask(input);

    expect(createGeneratedTaskRecord).toHaveBeenCalledWith({
      supabase,
      ctx: currentContext,
      ...input,
      workspaceId: "workspace-1",
    });
  });

});

describe("Tasks transport selection", () => {
  it("keeps in-process as the safe default", async () => {
    const application = await getTasksApplication({ supabase, currentContext });
    await application.getTask("task-1");

    expect(getTaskById).toHaveBeenCalledWith("org-1", "task-1", supabase);
    expect(requestHeaders).not.toHaveBeenCalled();
  });

  it("constructs the HTTP adapter only when explicitly enabled", async () => {
    process.env.TASKS_TRANSPORT = "http";
    process.env.TASKS_API_URL = "https://tasks.example.test";
    process.env.TASKS_SERVICE_AUTH_SECRET = "a-secure-tasks-service-secret-value-123";

    const application = await getTasksApplication({ supabase, currentContext });

    expect(application.context.organizationId).toBe("org-1");
    expect(requestHeaders).toHaveBeenCalledTimes(1);
  });

  it("allows a service-token transport when no session cookie exists", async () => {
    process.env.TASKS_TRANSPORT = "http";
    process.env.TASKS_API_URL = "https://tasks.example.test";
    process.env.TASKS_SERVICE_AUTH_SECRET = "a-secure-tasks-service-secret-value-123";
    requestHeaders.mockResolvedValueOnce(new Headers({ host: "app.example.test" }));

    await expect(getTasksApplication({ supabase, currentContext })).resolves.toMatchObject({
      context: { organizationId: "org-1" },
    });
  });

  it("fails closed when the independent runtime signing secret is missing", async () => {
    process.env.TASKS_TRANSPORT = "http";
    process.env.TASKS_API_URL = "https://tasks.example.test";

    await expect(getTasksApplication({ supabase, currentContext })).rejects.toThrow(
      "TASKS_SERVICE_AUTH_SECRET",
    );
  });

  it("fails closed on an unsupported transport value", () => {
    expect(() => resolveTasksTransportMode("direct-db")).toThrow(
      "Unsupported TASKS_TRANSPORT value",
    );
  });

  it("supports the staged shadow and remote-read modes", () => {
    expect(resolveTasksTransportMode("shadow")).toBe("shadow");
    expect(resolveTasksTransportMode("http-read")).toBe("http-read");
    expect(resolveTasksTransportMode("http")).toBe("http");
  });

  it("validates the shadow sampling percentage", () => {
    expect(resolveTasksShadowReadPercent(undefined)).toBe(100);
    expect(resolveTasksShadowReadPercent("10")).toBe(10);
    expect(() => resolveTasksShadowReadPercent("101")).toThrow("between 0 and 100");
  });
});
