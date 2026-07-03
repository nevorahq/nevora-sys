import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  assertApiKeyScope,
  validateDeveloperApiKey,
} from "@/modules/developer/services/api-key-service";
import { currentPeriodWindow } from "@/modules/billing";
import type {
  AuthenticatedApiKey,
  DeveloperApiKeyScope,
} from "@/modules/developer/types/developer.types";

export function unauthorizedApiResponse() {
  return NextResponse.json(
    { error: "unauthorized" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export function forbiddenApiResponse(error = "forbidden") {
  return NextResponse.json(
    { error },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}

export function rateLimitedApiResponse() {
  return NextResponse.json(
    { error: "api_rate_limited" },
    { status: 429, headers: { "Cache-Control": "no-store" } },
  );
}

function extractApiKey(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }
  return request.headers.get("x-nevora-api-key");
}

export async function authenticateApiKeyRequest(
  request: NextRequest,
): Promise<AuthenticatedApiKey | null> {
  const rawKey = extractApiKey(request);
  if (!rawKey) return null;
  return validateDeveloperApiKey(rawKey);
}

export function assertApiScope(
  auth: AuthenticatedApiKey,
  scope: DeveloperApiKeyScope,
): void {
  assertApiKeyScope(auth, scope);
}

export async function assertApiRateLimit(auth: AuthenticatedApiKey): Promise<void> {
  const supabase = await createClient();
  const { start } = currentPeriodWindow("minute");
  const { data, error } = await supabase.rpc("get_developer_api_rate_state", {
    p_api_key_id: auth.apiKeyId,
    p_key_hash: auth.keyHash,
    p_period_start: start?.toISOString() ?? new Date().toISOString(),
  });

  if (error || !data) throw new Error("api_rate_limited");

  const row = (Array.isArray(data) ? data[0] : data) as {
    monthly_limit: number | string | null;
    minute_limit: number | string | null;
    monthly_used: number | string;
    minute_used: number | string;
  } | null;

  if (!row) throw new Error("api_rate_limited");

  const monthlyLimit = row.monthly_limit === null ? null : Number(row.monthly_limit);
  const minuteLimit = row.minute_limit === null ? null : Number(row.minute_limit);
  if (monthlyLimit !== null && Number(row.monthly_used) + 1 > monthlyLimit) throw new Error("api_rate_limited");
  if (minuteLimit !== null && Number(row.minute_used) + 1 > minuteLimit) throw new Error("api_rate_limited");
}

export async function trackApiUsage(auth: AuthenticatedApiKey): Promise<void> {
  const supabase = await createClient();
  const month = currentPeriodWindow("monthly");
  const minute = currentPeriodWindow("minute");
  const { error } = await supabase.rpc("track_developer_api_usage", {
    p_api_key_id: auth.apiKeyId,
    p_key_hash: auth.keyHash,
    p_month_start: month.start?.toISOString() ?? null,
    p_month_end: month.end?.toISOString() ?? null,
    p_minute_start: minute.start?.toISOString() ?? null,
    p_minute_end: minute.end?.toISOString() ?? null,
  });
  if (error) throw new Error(error.message);
}
