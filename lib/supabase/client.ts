"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase клиент для BROWSER (Client Components).
 *
 * Зачем: Client Components работают в браузере и имеют доступ
 * к document.cookie. createBrowserClient автоматически читает
 * и записывает JWT-сессию через cookies браузера.
 *
 * Когда использовать:
 * - В компонентах с "use client"
 * - Для подписок (realtime)
 * - Для auth-операций на клиенте (signIn, signUp, signOut)
 *
 * Безопасность:
 * NEXT_PUBLIC_ переменные видны в браузере — это ОК для URL и anon key,
 * потому что RLS на уровне БД защищает данные.
 * anon key даёт доступ ТОЛЬКО к тому, что разрешено RLS-политиками.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
