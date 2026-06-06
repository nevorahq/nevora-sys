"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { getCategorySchemas } from "../schemas/category.schema";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

/**
 * Inline version — вызывается программно из формы транзакции.
 * Принимает простые аргументы (не FormData).
 * Возвращает id созданной категории, чтобы сразу подставить в dropdown.
 */
export async function createCategoryInline(
  name: string,
  type: "income" | "expense",
): Promise<{ id?: string; error?: string }> {
  const { dict } = await getDictionary();
  const { createCategorySchema } = getCategorySchemas({
    nameRequired: dict.money.errors.titleRequired,
    invalidType: dict.money.errors.invalidType,
  });

  const user = await requireUser();

  const parsed = createCategorySchema.safeParse({ name, type });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Validation error" };
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("money_categories")
      .insert({
        user_id: user.id,
        name: parsed.data.name,
        type: parsed.data.type,
      })
      .select("id")
      .single();

    if (error) {
      console.error("createCategoryInline error:", error);
      return { error: dict.money.errors.createCategoryFailed };
    }

    revalidatePath(ROUTES.money);
    revalidatePath(ROUTES.dashboard);

    return { id: data.id };
  } catch (err) {
    console.error("createCategoryInline unexpected error:", err);
    return { error: dict.money.errors.serverError };
  }
}

/**
 * FormData version — для standalone формы (если понадобится отдельная страница категорий).
 */
export async function createCategoryAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { dict } = await getDictionary();
  const { createCategorySchema } = getCategorySchemas({
    nameRequired: dict.money.errors.titleRequired,
    invalidType: dict.money.errors.invalidType,
  });

  const user = await requireUser();

  const rawData = {
    name: formData.get("name") as string,
    type: formData.get("type") as string,
  };

  const parsed = createCategorySchema.safeParse(rawData);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  try {
    const supabase = await createClient();

    const { error } = await supabase.from("money_categories").insert({
      user_id: user.id,
      name: parsed.data.name,
      type: parsed.data.type,
    });

    if (error) {
      console.error("createCategory error:", error);
      return { error: dict.money.errors.createCategoryFailed };
    }
  } catch (err) {
    console.error("createCategory unexpected error:", err);
    return { error: dict.money.errors.serverError };
  }

  revalidatePath(ROUTES.money);
  revalidatePath(ROUTES.dashboard);
  return {};
}
