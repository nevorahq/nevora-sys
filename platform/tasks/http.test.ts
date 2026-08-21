import { describe, expect, it, vi } from "vitest";
import {
  TASKS_HTTP_TRANSPORT_HEADER,
  TASKS_HTTP_TRANSPORT_VERSION,
} from "@nevora/tasks-api";
import { createHttpTasksApplication, TasksTransportError } from "./http";

const context = Object.freeze({
  organizationId: "org-1",
  workspaceId: "workspace-1",
  actorId: "user-1",
  permissions: ["data.read"],
});

describe("createHttpTasksApplication", () => {
  it("sends only operation input and forwards the authenticated session", async () => {
    const fetchImplementation = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ ok: true, data: { id: "task-1" } }),
    );
    const application = createHttpTasksApplication({
      baseUrl: "https://tasks.example.test",
      cookieHeader: "sb-session=secret",
      context,
      fetchImplementation,
    });

    await application.getTask("11111111-1111-4111-8111-111111111111");

    const [url, init] = fetchImplementation.mock.calls[0];
    expect(String(url)).toBe("https://tasks.example.test/api/internal/tasks");
    expect(init?.headers).toMatchObject({
      cookie: "sb-session=secret",
      [TASKS_HTTP_TRANSPORT_HEADER]: TASKS_HTTP_TRANSPORT_VERSION,
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      operation: "getTask",
      input: { taskId: "11111111-1111-4111-8111-111111111111" },
    });
    expect(String(init?.body)).not.toContain("organizationId");
    expect(String(init?.body)).not.toContain("workspaceId");
  });

  it("maps transport failures to a stable error", async () => {
    const application = createHttpTasksApplication({
      baseUrl: "https://tasks.example.test",
      cookieHeader: "sb-session=secret",
      context,
      fetchImplementation: vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ ok: false, error: "Forbidden", code: "PERMISSION_DENIED" }, { status: 403 }),
      ),
    });

    await expect(application.listTasks()).rejects.toEqual(
      expect.objectContaining<TasksTransportError>({
        name: "TasksTransportError",
        message: "Forbidden",
        status: 403,
      }),
    );
  });

  it("uses an operation-bound bearer token when no session exists", async () => {
    const fetchImplementation = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ ok: true, data: [] }),
    );
    const serviceTokenFactory = vi.fn(() => "nts1.payload.signature");
    const application = createHttpTasksApplication({
      baseUrl: "https://tasks.example.test",
      serviceTokenFactory,
      context,
      fetchImplementation,
    });
    await application.listTasks({ limit: 10 });

    expect(serviceTokenFactory).toHaveBeenCalledWith({ operation: "listTasks", input: { limit: 10 } });
    const init = fetchImplementation.mock.calls[0][1];
    expect(init?.headers).toMatchObject({ authorization: "Bearer nts1.payload.signature" });
    expect(init?.headers).not.toHaveProperty("cookie");
  });
});
