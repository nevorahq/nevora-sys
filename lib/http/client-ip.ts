import type { NextRequest } from "next/server";

/**
 * Извлекает IP клиента из заголовков прокси.
 *
 * В Next.js 16 у NextRequest нет `.ip`; за reverse-proxy/балансировщиком
 * реальный адрес приходит в `x-forwarded-for` (первый элемент списка) или
 * `x-real-ip`. Возвращаем "unknown", если ничего нет — лимитер всё равно
 * сгруппирует такие запросы вместе.
 *
 * IP используется только как ключ rate-limit (и хэшируется перед записью),
 * нигде не логируется и не сохраняется в сыром виде.
 */
export function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}
