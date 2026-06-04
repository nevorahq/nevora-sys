import { redirect } from "next/navigation";
import { getCurrentUser } from "./get-current-user";
import { ROUTES } from "@/shared/config/routes";

/**
 * Требовать авторизованного пользователя — или redirect.
 *
 * Зачем: используется в Server Actions и Server Components,
 * где неавторизованный доступ недопустим.
 *
 * Это "жёсткая" проверка — если нет пользователя, redirect на /login.
 * Всегда возвращает User (не null).
 *
 * Когда использовать:
 * - В Server Actions (createTodo, deleteTodo...)
 * - В dashboard page (загрузка данных)
 *
 * Почему не полагаемся только на proxy:
 * Proxy проверяет авторизацию на уровне HTTP-запроса.
 * Но Server Actions — это POST-запросы к тому же route.
 * Docs Next.js 16 предупреждают: "Always verify authentication
 * inside each Server Function rather than relying on Proxy alone."
 *
 * Defense in depth: proxy + requireUser = два уровня защиты.
 */
export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(ROUTES.login);
  }

  return user;
}
