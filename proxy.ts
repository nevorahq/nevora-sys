import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { ROUTES, isMachineRoute, isPublicRoute } from "@/shared/config/routes";

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
  const { pathname } = request.nextUrl;

  // Машинный маршрут (cron / внутренние метрики): сессии нет и не будет, а
  // редирект на /login превратил бы вызов планировщика в тихий 302. Обработчик
  // проверяет свой shared secret сам — см. MACHINE_ROUTES.
  if (isMachineRoute(pathname)) return NextResponse.next();

  const { user, supabaseResponse } = await updateSession(request);

  // Неавторизован + protected route → на логин
  if (!user && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.login;
    // ВАЖНО: NextResponse.redirect, а не Response.redirect. Next пост-обрабатывает
    // только NextResponse и добавляет заголовки, по которым клиентский рантайм
    // Server Actions распознаёт редирект при RSC-навигации. Сырой Response.redirect
    // возвращает голый 302, который flight-клиент трактует как ошибку
    // "An unexpected response was received from the server" (редирект из
    // loginAction/registerAction → protected route → сюда).
    return NextResponse.redirect(url);
  }

  // Авторизован + на странице логина/регистрации → на дашборд
  if (user && (pathname === ROUTES.login || pathname === ROUTES.register)) {
    const url = request.nextUrl.clone();
    url.pathname = ROUTES.dashboard;
    return NextResponse.redirect(url);
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
    // Исключаем статику, метадата-иконки (favicon/icon/apple-icon/manifest)
    // и любые файлы-картинки — иначе proxy редиректит их на /login и иконки
    // ломаются на публичных страницах (например, /login).
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|sitemap.xml|robots.txt|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|webmanifest)$).*)",
  ],
};
