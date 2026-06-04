"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/shared/config/routes";

/**
 * Server Action: выход пользователя.
 *
 * Что делает Supabase signOut:
 * 1. Инвалидирует refresh_token на сервере Supabase
 * 2. Удаляет cookies с JWT
 * 3. Следующий запрос — пользователь неавторизован
 *
 * Redirect на /login — чтобы пользователь не остался
 * на защищённой странице с устаревшим UI.
 */
export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(ROUTES.login);
}
