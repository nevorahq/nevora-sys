import { NextResponse } from "next/server";
import {
  SUBSCRIPTIONS_HTTP_TRANSPORT_HEADER,
  SUBSCRIPTIONS_HTTP_TRANSPORT_VERSION,
  executeSubscriptionsRequest,
  isSubscriptionsWriteOperation,
  subscriptionsHttpRequestSchema,
  verifySubscriptionsServiceToken,
  type SubscriptionsHttpRequest,
} from "@nevora/subscriptions-api";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";
import { createInProcessSubscriptionsApplication } from "@/platform/subscriptions/server";
import {
  resolveSubscriptionsServiceContext,
  SubscriptionsServiceIdentityError,
} from "@/platform/subscriptions/service-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const RESPONSE_HEADERS = { "Cache-Control": "no-store" } as const;

/** Compatibility RPC endpoint supporting session and signed service identity. */
export async function POST(request: Request): Promise<NextResponse> {
  if (
    request.headers.get(SUBSCRIPTIONS_HTTP_TRANSPORT_HEADER) !==
    SUBSCRIPTIONS_HTTP_TRANSPORT_VERSION
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

  const parsed = subscriptionsHttpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid Subscriptions API request." },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  try {
    const write = isSubscriptionsWriteOperation(parsed.data.operation);
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
    const application = createInProcessSubscriptionsApplication({ supabase, currentContext });
    const data = await executeSubscriptionsRequest(application, parsed.data);

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
    if (error instanceof SubscriptionsServiceIdentityError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: "SERVICE_IDENTITY_DENIED" },
        { status: error.httpStatus, headers: RESPONSE_HEADERS },
      );
    }
    logger.error("subscriptions.http_transport.failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, error: "Subscriptions API request failed." },
      { status: 500, headers: RESPONSE_HEADERS },
    );
  }
}

async function authenticateServiceRequest(
  token: string,
  operation: SubscriptionsHttpRequest["operation"],
  write: boolean,
) {
  const secret = process.env.SUBSCRIPTIONS_SERVICE_AUTH_SECRET?.trim() ?? "";
  const verified = verifySubscriptionsServiceToken(token, secret, operation);
  if (!verified.ok) {
    const status = verified.reason === "misconfigured" ? 503 : 401;
    throw new SubscriptionsServiceIdentityError(
      status === 503 ? "Subscriptions service identity is not configured." : "Invalid service identity.",
      status,
    );
  }
  const requiredPermission = write ? "data.write" : "org.read";
  if (!verified.claims.permissions.includes(requiredPermission)) {
    throw new SubscriptionsServiceIdentityError("Service identity lacks permission.");
  }
  const supabase = getServiceRoleClient();
  if (!supabase) {
    throw new SubscriptionsServiceIdentityError("Subscriptions service database access is not configured.", 503);
  }
  const currentContext = await resolveSubscriptionsServiceContext(supabase, verified.claims);
  return { currentContext, supabase };
}

function readBearerToken(authorization: string | null): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}
