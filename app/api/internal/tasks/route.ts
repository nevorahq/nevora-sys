import { NextResponse } from "next/server";
import {
  TASKS_HTTP_TRANSPORT_HEADER,
  TASKS_HTTP_TRANSPORT_VERSION,
  executeTasksRequest,
  isTasksWriteOperation,
  tasksHttpRequestSchema,
  verifyTasksServiceToken,
  type TasksHttpRequest,
} from "@nevora/tasks-api";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";
import { createInProcessTasksApplication } from "@/platform/tasks/server";
import {
  resolveTasksServiceContext,
  TasksServiceIdentityError,
} from "@/platform/tasks/service-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const RESPONSE_HEADERS = { "Cache-Control": "no-store" } as const;

/** Compatibility RPC endpoint supporting session and signed service identity. */
export async function POST(request: Request): Promise<NextResponse> {
  if (
    request.headers.get(TASKS_HTTP_TRANSPORT_HEADER) !==
    TASKS_HTTP_TRANSPORT_VERSION
  ) {
    return NextResponse.json(
      { ok: false, error: "Not found" },
      { status: 404, headers: RESPONSE_HEADERS },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Request body is too large." },
      { status: 413, headers: RESPONSE_HEADERS },
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not read request body." },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Request body is too large." },
      { status: 413, headers: RESPONSE_HEADERS },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  const parsed = tasksHttpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid Tasks API request." },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  try {
    const write = isTasksWriteOperation(parsed.data.operation);
    const bearer = readBearerToken(request.headers.get("authorization"));
    const authenticated = bearer
      ? await authenticateServiceRequest(bearer, parsed.data.operation, write)
      : {
          currentContext: await requireAppAccess({
            intent: write ? "write" : "read",
            permission: write ? "data.write" : undefined,
          }),
          supabase: await createClient(),
        };
    const { currentContext, supabase } = authenticated;
    const application = createInProcessTasksApplication({ supabase, currentContext });
    const data = await executeTasksRequest(application, parsed.data);

    return NextResponse.json(
      { ok: true, data },
      { status: 200, headers: RESPONSE_HEADERS },
    );
  } catch (error) {
    if (isAccessError(error)) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: error.httpStatus, headers: RESPONSE_HEADERS },
      );
    }
    if (error instanceof TasksServiceIdentityError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: "SERVICE_IDENTITY_DENIED" },
        { status: error.httpStatus, headers: RESPONSE_HEADERS },
      );
    }
    logger.error("tasks.http_transport.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, error: "Tasks API request failed." },
      { status: 500, headers: RESPONSE_HEADERS },
    );
  }
}

async function authenticateServiceRequest(
  token: string,
  operation: TasksHttpRequest["operation"],
  write: boolean,
) {
  const secret = process.env.TASKS_SERVICE_AUTH_SECRET?.trim() ?? "";
  const verified = verifyTasksServiceToken(token, secret, operation);
  if (!verified.ok) {
    const status = verified.reason === "misconfigured" ? 503 : 401;
    throw new TasksServiceIdentityError(
      status === 503 ? "Tasks service identity is not configured." : "Invalid service identity.",
      status,
    );
  }
  const requiredPermission = write ? "data.write" : "org.read";
  if (!verified.claims.permissions.includes(requiredPermission)) {
    throw new TasksServiceIdentityError("Service identity lacks permission.");
  }
  const supabase = getServiceRoleClient();
  if (!supabase) {
    throw new TasksServiceIdentityError("Tasks service database access is not configured.", 503);
  }
  const currentContext = await resolveTasksServiceContext(supabase, verified.claims);
  return { currentContext, supabase };
}

function readBearerToken(authorization: string | null): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}
