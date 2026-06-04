import { createClient } from "@/lib/supabase/server";

/**
 * Получить текущего пользователя (или null).
 *
 * Зачем: используется в Server Components и Server Actions
 * для проверки, авторизован ли пользователь.
 *
 * Возвращает user | null — вызывающий код решает, что делать.
 * Это "мягкая" проверка — не бросает ошибку.
 *
 * Когда использовать:
 * - Показать имя пользователя в header
 * - Условно показать кнопку "Войти" или "Выйти"
 * - Проверить авторизацию без redirect
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
