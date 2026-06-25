"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { getOnboardingSchema } from "../schemas/onboarding.schema";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

/**
 * Server Action: создать организацию в ходе онбординга.
 *
 * Вызывает DB-функцию create_organization() — SECURITY DEFINER.
 * Она атомарно создаёт: org + owner membership + default workspace.
 *
 * Порядок проверок:
 *   1. requireUser()          — аутентификация (defense in depth)
 *   2. Zod                    — формат данных
 *   3. supabase.rpc()         — бизнес-логика в БД (RLS + constraints)
 *
 * Почему rpc(), а не from("organizations").insert():
 *   Прямой INSERT нарушит bootstrap RLS (нет membership при создании).
 *   rpc() вызывает SECURITY DEFINER функцию, которая делает всё атомарно.
 *
 * После успеха: redirect на /dashboard.
 * Ошибка slug занят: возвращаем fieldError (пользователь меняет slug).
 */
export async function createOrganizationAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const schema = getOnboardingSchema(dict.onboarding.errors);

  // 1. Authentication
  await requireUser();

  // 2. Validation
  const rawData = {
    name: formData.get("name") as string,
    slug: formData.get("slug") as string,
    baseCurrency: formData.get("baseCurrency") as string,
  };

  const parsed = schema.safeParse(rawData);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  // 3. Call SECURITY DEFINER DB function
  let shouldRedirect = false;

  try {
    const supabase = await createClient();

    const { error } = await supabase.rpc("create_organization", {
      p_name: parsed.data.name,
      p_slug: parsed.data.slug,
      p_base_currency: parsed.data.baseCurrency,
    });

    if (error) {
      // Slug уже занят — unique constraint violation
      if (
        error.message.includes("duplicate key") ||
        error.message.includes("unique") ||
        error.code === "23505"
      ) {
        return {
          fieldErrors: { slug: [dict.onboarding.errors.slugTaken] },
        };
      }

      console.error("createOrganization RPC error:", error);
      return { error: dict.onboarding.errors.createFailed };
    }

    shouldRedirect = true;
  } catch (err) {
    console.error("createOrganization unexpected error:", err);
    return { error: dict.onboarding.errors.serverError };
  }

  // redirect() бросает исключение — должен быть вне try/catch
  if (shouldRedirect) {
    redirect(ROUTES.dashboard);
  }

  return {};
}
