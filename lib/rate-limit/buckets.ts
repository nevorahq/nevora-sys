/**
 * Allowlist бакетов rate-лимитера.
 *
 * Это TS-зеркало серверного источника правды (CASE в
 * `supabase/migrations/038_rate_limit_hardening.sql`). limit/window
 * НЕ передаются от вызывающего и не уходят в RPC — здесь они нужны лишь как
 * типобезопасный список разрешённых бакетов и для документации. Реальное
 * принуждение лимитов — в SQL-функции, которая отвергает неизвестные бакеты.
 */
export const RATE_LIMIT_BUCKETS = {
  "booking:availability": { limit: 120, windowSeconds: 60 },
  "booking:requests:ip":  { limit: 20,  windowSeconds: 60 },
  "booking:requests:org": { limit: 8,   windowSeconds: 60 },
  "booking:client-check": { limit: 15,  windowSeconds: 60 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMIT_BUCKETS;

/** Type guard: входит ли строка в allowlist бакетов. */
export function isAllowedBucket(bucket: string): bucket is RateLimitBucket {
  return Object.prototype.hasOwnProperty.call(RATE_LIMIT_BUCKETS, bucket);
}

/** SHA-256 hex — единственный допустимый формат identifier (без PII). */
export const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

export function isSha256Hex(value: string): boolean {
  return SHA256_HEX_RE.test(value);
}
