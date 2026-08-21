import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SUBSCRIPTIONS_HTTP_TRANSPORT_HEADER,
  SUBSCRIPTIONS_HTTP_TRANSPORT_VERSION,
  executeSubscriptionsRequest,
  isSubscriptionsWriteOperation,
  subscriptionsHttpRequestSchema,
  verifySubscriptionsServiceToken,
  type SubscriptionsApplication,
  type SubscriptionsRequestContext,
  type SubscriptionsServiceClaims,
} from "@nevora/subscriptions-api";
import {
  SubscriptionsRuntimeIdentityError,
  createSubscriptionsRuntimeApplication,
  resolveSubscriptionsRuntimeContext,
} from "@nevora/subscriptions-runtime";
import {
  SubscriptionsRuntimeConfigurationError,
  readSubscriptionsRuntimeEnvironment,
  type SubscriptionsRuntimeEnvironment,
} from "./environment";
import { createSubscriptionsServiceRoleClient } from "./supabase";
import { createDatabaseSubscriptionsRuntimeEffects } from "./effects";

const MAX_BODY_BYTES = 64 * 1024;
const RESPONSE_HEADERS = { "cache-control": "no-store" } as const;

export interface SubscriptionsRequestHandlerDependencies {
  readEnvironment?: () => SubscriptionsRuntimeEnvironment;
  createClient?: (environment: SubscriptionsRuntimeEnvironment) => SupabaseClient;
  resolveContext?: (
    client: SupabaseClient,
    claims: SubscriptionsServiceClaims,
  ) => Promise<Readonly<SubscriptionsRequestContext>>;
  createApplication?: (
    client: SupabaseClient,
    context: Readonly<SubscriptionsRequestContext>,
    environment: SubscriptionsRuntimeEnvironment,
  ) => SubscriptionsApplication;
}

/** Authenticate, bind live tenant context and execute one Subscriptions RPC locally. */
export async function handleSubscriptionsRequest(
  request: Request,
  dependencies: SubscriptionsRequestHandlerDependencies = {},
): Promise<Response> {
  if (
    request.headers.get(SUBSCRIPTIONS_HTTP_TRANSPORT_HEADER) !==
    SUBSCRIPTIONS_HTTP_TRANSPORT_VERSION
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
  const parsed = subscriptionsHttpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: "Invalid Subscriptions API request." }, 400);
  }

  try {
    const environment = (dependencies.readEnvironment ?? readSubscriptionsRuntimeEnvironment)();
    const token = readServiceToken(request.headers.get("authorization"));
    if (!token) return json({ ok: false, error: "Invalid service identity." }, 401);

    const verified = verifySubscriptionsServiceToken(
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
            ? "Subscriptions service identity is not configured."
            : "Invalid service identity.",
        },
        status,
      );
    }

    const requiredPermission = isSubscriptionsWriteOperation(parsed.data.operation)
      ? "data.write"
      : "org.read";
    if (!verified.claims.permissions.includes(requiredPermission)) {
      return json({ ok: false, error: "Service identity lacks permission." }, 403);
    }

    const client = (dependencies.createClient ?? createSubscriptionsServiceRoleClient)(environment);
    const context = await (dependencies.resolveContext ?? resolveSubscriptionsRuntimeContext)(
      client,
      verified.claims,
    );
    if (!context.permissions.includes(requiredPermission)) {
      return json({ ok: false, error: "Service identity lacks live permission." }, 403);
    }

    const application = dependencies.createApplication
      ? dependencies.createApplication(client, context, environment)
      : createSubscriptionsRuntimeApplication({
          supabase: client,
          context,
          effects: createDatabaseSubscriptionsRuntimeEffects(client, context, environment),
        });
    const data = await executeSubscriptionsRequest(application, parsed.data);
    return json({ ok: true, data }, 200);
  } catch (error) {
    if (error instanceof SubscriptionsRuntimeConfigurationError) {
      return json({ ok: false, error: error.message }, 503);
    }
    if (error instanceof SubscriptionsRuntimeIdentityError) {
      return json({ ok: false, error: error.message }, error.httpStatus);
    }
    console.error(
      "[subscriptions-runtime] request failed:",
      error instanceof Error ? error.message : String(error),
    );
    return json({ ok: false, error: "Subscriptions API request failed." }, 500);
  }
}

function readServiceToken(authorization: string | null): string | null {
  if (!authorization?.startsWith("Bearer nss1.")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}
