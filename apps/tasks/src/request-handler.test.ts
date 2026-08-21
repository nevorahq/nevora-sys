import { describe, expect, it, vi } from "vitest";
import {
  TASKS_HTTP_TRANSPORT_HEADER,
  TASKS_HTTP_TRANSPORT_VERSION,
  signTasksServiceToken,
  type TasksApplication,
  type TasksRequestContext,
} from "@nevora/tasks-api";
import { handleTasksRequest } from "./request-handler";
import { TasksRuntimeConfigurationError } from "./environment";

const SECRET = "tasks-service-secret-that-is-long-enough-123";
const context: TasksRequestContext = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  actorId: "33333333-3333-4333-8333-333333333333",
  permissions: ["org.read", "data.write"],
};

function request(
  operation: "getTask" | "createStandardTask",
  input: Record<string, unknown>,
  tokenOperation = operation,
) {
  const token = signTasksServiceToken(
    { context, operation: tokenOperation, ttlSeconds: 60 },
    SECRET,
  );
  return new Request("http://tasks.local/api/internal/tasks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [TASKS_HTTP_TRANSPORT_HEADER]: TASKS_HTTP_TRANSPORT_VERSION,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ operation, input }),
  });
}

function dependencies(application: Partial<TasksApplication> = {}) {
  return {
    readEnvironment: () => ({
      supabaseUrl: "https://example.supabase.co",
      supabaseServiceRoleKey: "service-role-key",
      serviceAuthSecret: SECRET,
    }),
    createClient: () => ({}) as never,
    resolveContext: vi.fn(async () => context),
    createApplication: () => application as TasksApplication,
  };
}

describe("standalone Tasks request handler", () => {
  it("hides requests without the strict transport header", async () => {
    const response = await handleTasksRequest(new Request("http://tasks.local/api/internal/tasks"));
    expect(response.status).toBe(404);
  });

  it("executes a read locally after token and live-context validation", async () => {
    const getTask = vi.fn(async () => null);
    const deps = dependencies({ getTask });
    const response = await handleTasksRequest(
      request("getTask", { taskId: "44444444-4444-4444-8444-444444444444" }),
      deps,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: null });
    expect(deps.resolveContext).toHaveBeenCalledOnce();
    expect(getTask).toHaveBeenCalledWith("44444444-4444-4444-8444-444444444444");
  });

  it("rejects a token replayed for another operation", async () => {
    const createStandardTask = vi.fn();
    const response = await handleTasksRequest(
      request("createStandardTask", { title: "Prepare report" }, "getTask"),
      dependencies({ createStandardTask }),
    );

    expect(response.status).toBe(401);
    expect(createStandardTask).not.toHaveBeenCalled();
  });

  it("fails closed when runtime secrets are missing", async () => {
    const response = await handleTasksRequest(
      request("getTask", { taskId: "44444444-4444-4444-8444-444444444444" }),
      { readEnvironment: () => { throw new TasksRuntimeConfigurationError("missing"); } },
    );
    expect(response.status).toBe(503);
  });
});
