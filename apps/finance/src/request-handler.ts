import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FINANCE_HTTP_TRANSPORT_HEADER,
  FINANCE_HTTP_TRANSPORT_VERSION,
  executeFinanceRequest,
  isFinanceWriteOperation,
  financeHttpRequestSchema,
  verifyFinanceServiceToken,
  type FinanceApplication,
  type FinanceRequestContext,
  type FinanceServiceClaims,
} from "@nevora/finance-api";
import {
  FinanceRuntimeIdentityError,
  createFinanceRuntimeApplication,
  resolveFinanceRuntimeContext,
} from "@nevora/finance-runtime";
import {
  FinanceRuntimeConfigurationError,
  readFinanceRuntimeEnvironment,
  type FinanceRuntimeEnvironment,
} from "./environment";
import { createFinanceServiceRoleClient } from "./supabase";

const MAX_BODY_BYTES = 64 * 1024;
const RESPONSE_HEADERS = { "cache-control": "no-store" } as const;

export interface FinanceRequestHandlerDependencies {
  readEnvironment?: () => FinanceRuntimeEnvironment;
  createClient?: (environment: FinanceRuntimeEnvironment) => SupabaseClient;
  resolveContext?: (
    client: SupabaseClient,
    claims: FinanceServiceClaims,
  ) => Promise<Readonly<FinanceRequestContext>>;
  createApplication?: (
    client: SupabaseClient,
    context: Readonly<FinanceRequestContext>,
  ) => FinanceApplication;
}

/**
 * Authenticate, bind live tenant context and execute one Finance RPC locally.
 *
 * Unlike the Subscriptions request handler, this one needs no custom effects
 * wiring: `createMoneyAccount` (the port's only mutation) emits no domain
 * events or audit logs and calls no other product — confirmed by reading
 * `modules/moneyflow/services/money-account-service.ts` before porting it.
 * `createFinanceRuntimeApplication` is used directly.
 */
export async function handleFinanceRequest(
  request: Request,
  dependencies: FinanceRequestHandlerDependencies = {},
): Promise<Response> {
  if (
    request.headers.get(FINANCE_HTTP_TRANSPORT_HEADER) !==
    FINANCE_HTTP_TRANSPORT_VERSION
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
  const parsed = financeHttpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: "Invalid Finance API request." }, 400);
  }

  try {
    const environment = (dependencies.readEnvironment ?? readFinanceRuntimeEnvironment)();
    const token = readServiceToken(request.headers.get("authorization"));
    if (!token) return json({ ok: false, error: "Invalid service identity." }, 401);

    const verified = verifyFinanceServiceToken(
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
            ? "Finance service identity is not configured."
            : "Invalid service identity.",
        },
        status,
      );
    }

    const requiredPermission = isFinanceWriteOperation(parsed.data.operation)
      ? "data.write"
      : "org.read";
    if (!verified.claims.permissions.includes(requiredPermission)) {
      return json({ ok: false, error: "Service identity lacks permission." }, 403);
    }

    const client = (dependencies.createClient ?? createFinanceServiceRoleClient)(environment);
    const context = await (dependencies.resolveContext ?? resolveFinanceRuntimeContext)(
      client,
      verified.claims,
    );
    if (!context.permissions.includes(requiredPermission)) {
      return json({ ok: false, error: "Service identity lacks live permission." }, 403);
    }

    const application = dependencies.createApplication
      ? dependencies.createApplication(client, context)
      : createFinanceRuntimeApplication({ supabase: client, context });
    const data = await executeFinanceRequest(application, parsed.data);
    return json({ ok: true, data }, 200);
  } catch (error) {
    if (error instanceof FinanceRuntimeConfigurationError) {
      return json({ ok: false, error: error.message }, 503);
    }
    if (error instanceof FinanceRuntimeIdentityError) {
      return json({ ok: false, error: error.message }, error.httpStatus);
    }
    console.error(
      "[finance-runtime] request failed:",
      error instanceof Error ? error.message : String(error),
    );
    return json({ ok: false, error: "Finance API request failed." }, 500);
  }
}

function readServiceToken(authorization: string | null): string | null {
  if (!authorization?.startsWith("Bearer nfs1.")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}
