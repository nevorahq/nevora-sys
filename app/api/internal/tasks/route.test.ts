import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessError } from "@/lib/security/access-errors";
import {
  TASKS_HTTP_TRANSPORT_HEADER,
  TASKS_HTTP_TRANSPORT_VERSION,
  signTasksServiceToken,
} from "@nevora/tasks-api";

const requireAppAccess = vi.fn();
const createClient = vi.fn();
const getServiceRoleClient = vi.fn();
const resolveTasksServiceContext = vi.fn();
const getTask = vi.fn();
const createStandardTask = vi.fn();
const application = { getTask, createStandardTask };
const createInProcessTasksApplication = vi.fn(() => application);

vi.mock("@/lib/security", () => ({
  requireAppAccess,
  isAccessError: (error: unknown) => error instanceof AccessError,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/supabase/service-role", () => ({ getServiceRoleClient }));
vi.mock("@/lib/observability/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/platform/tasks/server", () => ({ createInProcessTasksApplication }));
vi.mock("@/platform/tasks/service-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/tasks/service-context")>();
  return { ...actual, resolveTasksServiceContext };
});

const { POST } = await import("./route");

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const SERVICE_SECRET = "a-secure-tasks-service-secret-value-123";
const serviceContext = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
  actorId: "44444444-4444-4444-8444-444444444444",
  permissions: ["org.read", "data.write"],
};

function request(body: unknown, includeTransportHeader = true, authorization?: string): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (includeTransportHeader) {
    headers.set(TASKS_HTTP_TRANSPORT_HEADER, TASKS_HTTP_TRANSPORT_VERSION);
  }
  if (authorization) headers.set("authorization", authorization);
  return new Request("https://app.example.test/api/internal/tasks", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const previousServiceSecret = process.env.TASKS_SERVICE_AUTH_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.TASKS_SERVICE_AUTH_SECRET;
  requireAppAccess.mockResolvedValue({ org: { id: "org-1" } });
  createClient.mockResolvedValue({ marker: "supabase" });
  getServiceRoleClient.mockReturnValue({ marker: "service-role" });
  resolveTasksServiceContext.mockResolvedValue({ org: { id: serviceContext.organizationId } });
  getTask.mockResolvedValue({ id: TASK_ID });
  createStandardTask.mockResolvedValue({ ok: true, taskId: TASK_ID, created: true });
});

afterAll(() => {
  if (previousServiceSecret === undefined) delete process.env.TASKS_SERVICE_AUTH_SECRET;
  else process.env.TASKS_SERVICE_AUTH_SECRET = previousServiceSecret;
});

describe("Tasks internal HTTP transport", () => {
  it("hides the endpoint without the internal transport header", async () => {
    const response = await POST(request({ operation: "getTask", input: { taskId: TASK_ID } }, false));
    expect(response.status).toBe(404);
    expect(requireAppAccess).not.toHaveBeenCalled();
  });

  it("rejects tenant identifiers in the wire payload", async () => {
    const response = await POST(request({
      operation: "getTask",
      input: { taskId: TASK_ID, organizationId: "attacker-org" },
    }));
    expect(response.status).toBe(400);
    expect(requireAppAccess).not.toHaveBeenCalled();
  });

  it("rebuilds read context from the session and delegates", async () => {
    const response = await POST(request({ operation: "getTask", input: { taskId: TASK_ID } }));
    expect(response.status).toBe(200);
    expect(requireAppAccess).toHaveBeenCalledWith({ intent: "read", permission: undefined });
    expect(getTask).toHaveBeenCalledWith(TASK_ID);
    await expect(response.json()).resolves.toEqual({ ok: true, data: { id: TASK_ID } });
  });

  it("requires write permission before dispatching a mutation", async () => {
    const response = await POST(request({
      operation: "createStandardTask",
      input: { title: "Prepare report" },
    }));
    expect(response.status).toBe(200);
    expect(requireAppAccess).toHaveBeenCalledWith({ intent: "write", permission: "data.write" });
    expect(createStandardTask).toHaveBeenCalledWith({ title: "Prepare report" });
  });

  it("returns typed access refusals without dispatching", async () => {
    requireAppAccess.mockRejectedValue(new AccessError("PERMISSION_DENIED"));
    const response = await POST(request({
      operation: "createStandardTask",
      input: { title: "Prepare report" },
    }));
    expect(response.status).toBe(403);
    expect(createStandardTask).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "PERMISSION_DENIED" });
  });

  it("accepts an operation-bound service identity without a user session", async () => {
    process.env.TASKS_SERVICE_AUTH_SECRET = SERVICE_SECRET;
    const token = signTasksServiceToken({ context: serviceContext, operation: "getTask" }, SERVICE_SECRET);
    const response = await POST(request(
      { operation: "getTask", input: { taskId: TASK_ID } },
      true,
      `Bearer ${token}`,
    ));
    expect(response.status).toBe(200);
    expect(requireAppAccess).not.toHaveBeenCalled();
    expect(getServiceRoleClient).toHaveBeenCalledTimes(1);
    expect(resolveTasksServiceContext).toHaveBeenCalledWith(
      { marker: "service-role" },
      expect.objectContaining({ operation: "getTask", organizationId: serviceContext.organizationId }),
    );
  });

  it("rejects a service token replayed for another operation", async () => {
    process.env.TASKS_SERVICE_AUTH_SECRET = SERVICE_SECRET;
    const token = signTasksServiceToken({ context: serviceContext, operation: "listTasks" }, SERVICE_SECRET);
    const response = await POST(request(
      { operation: "getTask", input: { taskId: TASK_ID } },
      true,
      `Bearer ${token}`,
    ));
    expect(response.status).toBe(401);
    expect(getTask).not.toHaveBeenCalled();
  });
});
