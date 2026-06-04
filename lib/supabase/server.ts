import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase клиент для SERVER (Server Components, Server Actions, Route Handlers).
 *
 * Зачем: На сервере нет document.cookie. Вместо этого мы читаем cookies
 * из HTTP-запроса через Next.js API `cookies()`.
 *
 * Как это работает:
 * 1. Браузер отправляет HTTP-запрос с cookies в заголовках
 * 2. Next.js парсит заголовки и предоставляет API cookies()
 * 3. Supabase SSR читает JWT-сессию из этих cookies
 * 4. JWT передаётся в PostgreSQL → RLS знает, кто делает запрос
 *
 * Когда использовать:
 * - В Server Components (чтение данных)
 * - В Server Actions (создание/обновление/удаление)
 * - В Route Handlers (API endpoints)
 *
 * Почему async: cookies() в Next.js 16 — асинхронная функция.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // getAll — Supabase читает все cookies для восстановления сессии
        getAll() {
          return cookieStore.getAll();
        },
        // setAll — Supabase записывает/обновляет cookies (refresh token и т.д.)
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // В Server Components cookies доступны только для чтения.
            // set() бросит ошибку — это нормально, игнорируем.
            // В Server Actions и Route Handlers set() работает.
          }
        },
      },
    },
  );
}
