import "server-only";
import { cookies } from "next/headers";

/**
 * Preference cookie для выбранной активной организации.
 *
 * НЕ источник авторизации — только "запрос" клиента, какую организацию
 * показать. requireOrg() всегда перепроверяет значение против реального
 * active membership пользователя (resolveActiveOrganizationId), прежде чем
 * ему довериться. Подделка/устаревшее значение → безопасный fallback,
 * никогда не cross-tenant доступ.
 */
const ACTIVE_ORG_COOKIE = "active_org_id";

/** Читает выбранную организацию из cookie. Безопасно вызывать в RSC-рендере. */
export async function getSelectedOrganizationId(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_ORG_COOKIE)?.value ?? null;
}

/**
 * Сохраняет выбранную организацию.
 *
 * Пишется ТОЛЬКО после серверной верификации active membership (см.
 * switchOrganizationAction / requireOrg fallback-refresh). Запись cookie в
 * Server Component-рендере запрещена Next.js — как и в lib/supabase/server.ts,
 * ошибка молча игнорируется (не блокирует основной рендер).
 */
export async function setSelectedOrganizationId(organizationId: string): Promise<void> {
  try {
    const store = await cookies();
    store.set(ACTIVE_ORG_COOKIE, organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {
    // Вызвано во время рендера Server Component — cookies() только для чтения.
  }
}
