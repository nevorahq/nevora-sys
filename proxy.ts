import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { ROUTES, PUBLIC_ROUTES } from "@/shared/config/routes";

/**
 * Proxy (бывший Middleware) — перехватывает КАЖДЫЙ запрос.
 *
 * В Next.js 16 middleware переименован в proxy.
 * Файл должен быть в корне проекта и экспортировать функцию `proxy`.
 *
 * Что делает:
 * 1. Обновляет Supabase-сессию (refresh token если JWT истёк)
 * 2. Проверяет: пользователь авторизован?
 * 3. Если нет — и он пытается зайти на protected route — редирект на /login
 * 4. Если да — и он на /login или /register — редирект на /dashboard
 *
 * Аналогия: охранник на входе в офис.
 * - Проверяет пропуск (JWT)
 * - Без пропуска — отправляет на reception (login)
 * - С пропуском пришёл на reception — отправляет к рабочему месту (dashboard)
 */
export async function proxy(request: NextRequest) {
  const { user, supabaseResponse } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname === route);

  // Неавторизован + protected route → на логин
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.login;
    return Response.redirect(url);
  }

  // Авторизован + на странице логина/регистрации → на дашборд
  if (user && (pathname === ROUTES.login || pathname === ROUTES.register)) {
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.dashboard;
    return Response.redirect(url);
  }

  return supabaseResponse;
}

/**
 * Matcher — на каких путях запускается proxy.
 *
 * Исключаем статику и ресурсы — им не нужна проверка авторизации.
 * Без matcher proxy будет запускаться даже для CSS и JS файлов,
 * что замедлит загрузку без пользы.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
