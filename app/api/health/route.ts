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
 *
 * Роут обязан отвечать одинаково С сессией и БЕЗ неё: monitoring и load balancer
 * не отправляют cookies.
 */
export async function GET() {
  const checks: Record<string, "ok" | "error"> = {
    server: "ok",
    database: "error",
  };

  try {
    const supabase = await createClient();
    // Проверяем связь с БД через `plans` — таблицу, читаемую ролью `anon`.
    //
    // Раньше здесь был `todos`, и health был сломан ровно для тех, ради кого
    // существует. `createClient()` берёт сессию из cookies; у monitoring и
    // load balancer'а их нет, значит роль — `anon`, а у неё нет SELECT на
    // `todos` → PostgREST отвечает `42501 permission denied` → database:"error"
    // → 503 всегда. В браузере с сессией тот же роут отдавал 200 и маскировал баг.
    //
    // Чинить это грантом `SELECT ON todos TO anon` нельзя — это утечка данных.
    // `plans` не содержит PII и уже публична (её читает лендинг с ценами).
    // head:true — строки не тянем; пустая таблица всё равно доказывает связь.
    const { error } = await supabase
      .from("plans")
      .select("*", { count: "exact", head: true });

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
