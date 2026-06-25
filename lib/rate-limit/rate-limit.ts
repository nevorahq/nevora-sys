import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { buildRateLimitIdentifier } from "./identifier";
import { isAllowedBucket, isSha256Hex, type RateLimitBucket } from "./buckets";

/**
 * Rate limiter поверх Postgres (Supabase) — единственного общего хранилища
 * проекта. In-memory лимитер не используется намеренно: в serverless/
 * multi-instance среде он не даёт реального ограничения.
 *
 * Безопасность (migration 038):
 *   • Публичный клиент НЕ может вызывать write-RPC. Функция check_rate_limit
 *     доступна только service_role, поэтому адаптер ходит через серверный
 *     service-role клиент, а не через anon/authenticated сессию.
 *   • limit/window НЕ передаются от вызывающего — они зашиты в allowlist по
 *     bucket на стороне SQL. Здесь bucket дополнительно ограничен типом и
 *     проверяется guard'ом (defense in depth).
 *   • identifier — SHA-256 hex от ip(+scope); raw IP/PII не хранятся и не логируются.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  /** Бакет из allowlist (см. lib/rate-limit/buckets.ts). */
  bucket: RateLimitBucket;
  /** IP клиента (см. getClientIp). */
  ip: string;
  /** Доп. область — например organization slug, чтобы лимиты не текли между орг. */
  scope?: string;
}

export { buildRateLimitIdentifier } from "./identifier";

/** Безопасная деградация: не блокируем легитимный трафик при сбое/недоступности. */
const FAIL_OPEN: RateLimitResult = {
  allowed: true,
  remaining: 0,
  retryAfterSeconds: 0,
};

export async function checkRateLimit(
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  // Defense in depth: bucket обязан быть из allowlist.
  if (!isAllowedBucket(opts.bucket)) {
    return FAIL_OPEN;
  }

  const identifier = buildRateLimitIdentifier(opts.ip, opts.scope);
  if (!isSha256Hex(identifier)) {
    return FAIL_OPEN;
  }

  // Только server-side service-role клиент имеет право вызвать write-RPC.
  // Если ключ не сконфигурирован — fail-open (лимит не применяется, но и
  // канала злоупотребления через anon нет).
  const supabase = getServiceRoleClient();
  if (!supabase) {
    return FAIL_OPEN;
  }

  try {
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_bucket: opts.bucket,
      p_identifier: identifier,
    });

    if (error || !data) {
      return FAIL_OPEN;
    }

    const d = data as {
      allowed: boolean;
      remaining: number;
      retry_after_seconds: number;
    };

    return {
      allowed: d.allowed,
      remaining: d.remaining,
      retryAfterSeconds: d.retry_after_seconds,
    };
  } catch {
    return FAIL_OPEN;
  }
}

/**
 * Ответ 429 с заголовком Retry-After (в секундах).
 */
export function tooManyRequestsResponse(retryAfterSeconds: number): NextResponse {
  const retry = Math.max(1, Math.ceil(retryAfterSeconds));
  return NextResponse.json(
    { error: "rate_limited" },
    {
      status: 429,
      headers: {
        "Retry-After": String(retry),
        "Cache-Control": "no-store",
      },
    },
  );
}
