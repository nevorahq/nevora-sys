import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TASKS_HTTP_TRANSPORT_HEADER,
  TASKS_HTTP_TRANSPORT_VERSION,
  executeTasksRequest,
  isTasksWriteOperation,
  tasksHttpRequestSchema,
  verifyTasksServiceToken,
  type TasksApplication,
  type TasksRequestContext,
  type TasksServiceClaims,
} from "@nevora/tasks-api";
import {
  TasksRuntimeIdentityError,
  createDatabaseTasksRuntimeEffects,
  createTasksRuntimeApplication,
  resolveTasksRuntimeContext,
} from "@nevora/tasks-runtime";
import {
  TasksRuntimeConfigurationError,
  readTasksRuntimeEnvironment,
  type TasksRuntimeEnvironment,
} from "./environment";
import { createTasksServiceRoleClient } from "./supabase";

const MAX_BODY_BYTES = 64 * 1024;
const RESPONSE_HEADERS = { "cache-control": "no-store" } as const;

export interface TasksRequestHandlerDependencies {
  readEnvironment?: () => TasksRuntimeEnvironment;
  createClient?: (environment: TasksRuntimeEnvironment) => SupabaseClient;
  resolveContext?: (
    client: SupabaseClient,
    claims: TasksServiceClaims,
  ) => Promise<Readonly<TasksRequestContext>>;
  createApplication?: (
    client: SupabaseClient,
    context: Readonly<TasksRequestContext>,
  ) => TasksApplication;
}

/** Authenticate, bind live tenant context and execute one Tasks RPC locally. */
export async function handleTasksRequest(
  request: Request,
  dependencies: TasksRequestHandlerDependencies = {},
): Promise<Response> {
  if (
    request.headers.get(TASKS_HTTP_TRANSPORT_HEADER) !==
    TASKS_HTTP_TRANSPORT_VERSION
  ) {
    return json({ ok: false, error: "Not found" }, 404);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "Request body is too large." }, 413);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return json({ ok: false, error: "Could not read request body." }, 400);
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "Request body is too large." }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }
  const parsed = tasksHttpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: "Invalid Tasks API request." }, 400);
  }

  try {
    const environment = (dependencies.readEnvironment ?? readTasksRuntimeEnvironment)();
    const token = readServiceToken(request.headers.get("authorization"));
    if (!token) return json({ ok: false, error: "Invalid service identity." }, 401);

    const verified = verifyTasksServiceToken(
      token,
      environment.serviceAuthSecret,
      parsed.data.operation,
    );
    if (!verified.ok) {
      const status = verified.reason === "misconfigured" ? 503 : 401;
      return json(
        {
          ok: false,
          error: status === 503
            ? "Tasks service identity is not configured."
            : "Invalid service identity.",
        },
        status,
      );
    }

    const requiredPermission = isTasksWriteOperation(parsed.data.operation)
      ? "data.write"
      : "org.read";
    if (!verified.claims.permissions.includes(requiredPermission)) {
      return json({ ok: false, error: "Service identity lacks permission." }, 403);
    }

    const client = (dependencies.createClient ?? createTasksServiceRoleClient)(environment);
    const context = await (dependencies.resolveContext ?? resolveTasksRuntimeContext)(
      client,
      verified.claims,
    );
    if (!context.permissions.includes(requiredPermission)) {
      return json({ ok: false, error: "Service identity lacks live permission." }, 403);
    }

    const application = dependencies.createApplication
      ? dependencies.createApplication(client, context)
      : createTasksRuntimeApplication({
          supabase: client,
          context,
          effects: createDatabaseTasksRuntimeEffects(client, context),
        });
    const data = await executeTasksRequest(application, parsed.data);
    return json({ ok: true, data }, 200);
  } catch (error) {
    if (error instanceof TasksRuntimeConfigurationError) {
      return json({ ok: false, error: error.message }, 503);
    }
    if (error instanceof TasksRuntimeIdentityError) {
      return json({ ok: false, error: error.message }, error.httpStatus);
    }
    console.error(
      "[tasks-runtime] request failed:",
      error instanceof Error ? error.message : String(error),
    );
    return json({ ok: false, error: "Tasks API request failed." }, 500);
  }
}

function readServiceToken(authorization: string | null): string | null {
  if (!authorization?.startsWith("Bearer nts1.")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}
