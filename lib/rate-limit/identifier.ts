import { createHash } from "node:crypto";

/**
 * Строит непрозрачный идентификатор лимита.
 *
 * Хэшируем (ip + scope) через sha256, чтобы в БД не попадал сырой IP, а
 * scope (например organization slug) изолировал счётчики между организациями.
 * email/phone сюда не передаются вовсе. Чистая функция — без зависимостей от
 * Next/Supabase, чтобы её было легко покрыть тестами.
 */
export function buildRateLimitIdentifier(ip: string, scope?: string): string {
  return createHash("sha256")
    .update(`${ip || "unknown"}|${scope ?? ""}`)
    .digest("hex");
}
