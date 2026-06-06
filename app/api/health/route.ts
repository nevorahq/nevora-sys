import { createClient } from "@/lib/supabase/server";

/**
 * Health Check endpoint — GET /api/health
 *
 * Production health check должен проверять НЕ ТОЛЬКО что сервер жив,
 * но и что зависимости доступны (БД, Auth и т.д.).
 *
 * Два уровня:
 * - "healthy" — всё работает
 * - "degraded" — сервер жив, но БД недоступна
 *
 * Load balancer и мониторинг используют HTTP status code:
 * - 200 → всё OK, направлять трафик
 * - 503 → проблемы, не направлять трафик
 */
export async function GET() {
  const checks: Record<string, "ok" | "error"> = {
    server: "ok",
    database: "error",
  };

  try {
    const supabase = await createClient();
    // Простой запрос для проверки соединения с БД.
    // count вместо select * — не тянем данные, только проверяем связь.
    const { error } = await supabase
      .from("todos")
      .select("id", { count: "exact", head: true });

    checks.database = error ? "error" : "ok";
  } catch {
    checks.database = "error";
  }

  const isHealthy = Object.values(checks).every((v) => v === "ok");

  return Response.json(
    {
      status: isHealthy ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: isHealthy ? 200 : 503 },
  );
}
