"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getAuthSchemas } from "../schemas/auth.schema";
import {
  onboardingUrl,
  resolveProductEntryRoute,
  ROUTES,
} from "@/shared/config/routes";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import type { ActionResult } from "@/lib/validators/common";

export async function registerAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const { registerSchema } = getAuthSchemas(dict.auth.errors);
  const destination =
    resolveProductEntryRoute(formData.get("next")?.toString()) ?? ROUTES.appHome;

  const rawData = {
    displayName: formData.get("displayName") as string,
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    confirmPassword: formData.get("confirmPassword") as string,
  };

  const parsed = registerSchema.safeParse(rawData);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  let shouldRedirect = false;

  try {
    const supabase = await createClient();
    const requestHeaders = await headers();
    const forwardedHost = requestHeaders.get("x-forwarded-host");
    const host = forwardedHost ?? requestHeaders.get("host");
    const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
    const configuredOrigin = (
      process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL
    )?.replace(/\/$/, "");
    const requestOrigin = host ? `${protocol}://${host}` : null;
    const origin = configuredOrigin ?? requestOrigin;

    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { display_name: parsed.data.displayName },
        ...(origin
          ? {
              emailRedirectTo: `${origin}${ROUTES.authCallback}?next=${encodeURIComponent(destination)}`,
            }
          : {}),
      },
    });

    if (error) {
      return { error: error.message };
    }

    // Если проект требует подтверждения email, signUp НЕ создаёт сессию.
    // Тогда редирект на /dashboard бессмысленен (proxy отобьёт на /login) —
    // показываем экран «проверьте почту». Когда подтверждение выключено,
    // session присутствует сразу и мы уходим на dashboard как раньше.
    if (!data.session) {
      return { emailConfirmationRequired: true };
    }

    shouldRedirect = true;
  } catch (err) {
    console.error("Register error:", err);
    return { error: dict.auth.errors.serverError };
  }

  if (shouldRedirect) {
    redirect(onboardingUrl(destination));
  }

  return {};
}
