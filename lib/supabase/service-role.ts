import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase клиент с SERVICE-ROLE ключом — ТОЛЬКО для сервера.
 *
 * Назначение: серверные операции, которые не должны быть доступны клиентским
 * ролям напрямую (anon/authenticated), например write-RPC rate-лимитера. Ключ
 * service_role обходит RLS и НЕ должен попадать в браузер — поэтому переменная
 * без префикса NEXT_PUBLIC_ (не бандлится на клиент); модуль импортируется
 * только серверным кодом.
 *
 * Если SUPABASE_SERVICE_ROLE_KEY не сконфигурирован, возвращаем null —
 * вызывающий код деградирует безопасно (например, rate limiter fail-open),
 * не роняя приложение и не требуя ключ на этапе сборки.
 */
let cached: SupabaseClient | null | undefined;

export function getServiceRoleClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    cached = null;
    return cached;
  }

  cached = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}
