import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * Supabase клиент специально для proxy (бывший middleware).
 *
 * Почему отдельный от server.ts:
 * В proxy нет доступа к cookies() из next/headers.
 * Вместо этого мы читаем cookies из request и пишем в response.
 *
 * Что делает этот клиент:
 * 1. Читает JWT-сессию из cookies запроса
 * 2. Если JWT истёк — обновляет через refresh token
 * 3. Записывает обновлённые cookies в response
 * 4. Возвращает { supabase, response } для дальнейшей работы
 */
export async function updateSession(request: NextRequest) {
  // Создаём response, в который будем писать обновлённые cookies
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Устанавливаем cookies и в request (для downstream),
          // и в response (для браузера)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // ВАЖНО: getUser() проверяет JWT и обновляет сессию если нужно.
  // Не используй getSession() — она не валидирует JWT на сервере.
  // getSession() просто читает JWT без проверки подписи.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, supabaseResponse };
}
