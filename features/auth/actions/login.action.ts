"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasActiveOrganization } from "@/lib/auth/require-no-organization";
import { getAuthSchemas } from "../schemas/auth.schema";
import {
  onboardingUrl,
  resolveProductEntryRoute,
  ROUTES,
} from "@/shared/config/routes";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import type { ActionResult } from "@/lib/validators/common";

export async function loginAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const { loginSchema } = getAuthSchemas(dict.auth.errors);
  const destination =
    resolveProductEntryRoute(formData.get("next")?.toString()) ?? ROUTES.appHome;

  const rawData = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const parsed = loginSchema.safeParse(rawData);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  let redirectDestination: string | null = null;

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      return { error: dict.auth.errors.invalidCredentials };
    }

    const hasOrganization = await hasActiveOrganization(data.user.id);
    redirectDestination = hasOrganization ? destination : onboardingUrl(destination);
  } catch (err) {
    console.error("Login error:", err);
    return { error: dict.auth.errors.serverError };
  }

  if (redirectDestination) {
    redirect(redirectDestination);
  }

  return {};
}
