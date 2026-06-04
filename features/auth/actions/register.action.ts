"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthSchemas } from "../schemas/auth.schema";
import { ROUTES } from "@/shared/config/routes";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import type { ActionResult } from "@/lib/validators/common";

export async function registerAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const { registerSchema } = getAuthSchemas(dict.auth.errors);

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

    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { display_name: parsed.data.displayName },
      },
    });

    if (error) {
      return { error: error.message };
    }

    shouldRedirect = true;
  } catch (err) {
    console.error("Register error:", err);
    return { error: dict.auth.errors.serverError };
  }

  if (shouldRedirect) {
    redirect(ROUTES.dashboard);
  }

  return {};
}
