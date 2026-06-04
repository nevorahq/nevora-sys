/**
 * Health Check endpoint — GET /api/health
 *
 * Зачем: любой production-сервис должен иметь health check.
 * Его используют:
 * - мониторинг (Uptime Robot, Datadog)
 * - load balancer (проверяет, жив ли инстанс)
 * - CI/CD (проверяет, что deploy успешен)
 *
 * Это Route Handler — единственный наш API route.
 * Все остальные мутации — через Server Actions.
 */
export async function GET() {
  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
