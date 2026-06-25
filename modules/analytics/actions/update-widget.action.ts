"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { updateWidgetSchema } from "../schemas/analytics.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function updateWidgetAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { org } = await requireOrg();

  const rawData = {
    widgetId:  formData.get("widgetId") as string,
    name:      (formData.get("name") as string) || undefined,
    config:    (() => {
      try { return JSON.parse(formData.get("config") as string); } catch { return undefined; }
    })(),
    position:  formData.get("position") ? Number(formData.get("position")) : undefined,
    isVisible: formData.get("isVisible") !== null
      ? formData.get("isVisible") === "true"
      : undefined,
  };

  const parsed = updateWidgetSchema.safeParse(rawData);
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

    const updatePayload: Record<string, unknown> = {};
    if (parsed.data.name      !== undefined) updatePayload.name       = parsed.data.name;
    if (parsed.data.config    !== undefined) updatePayload.config     = parsed.data.config;
    if (parsed.data.position  !== undefined) updatePayload.position   = parsed.data.position;
    if (parsed.data.isVisible !== undefined) updatePayload.is_visible = parsed.data.isVisible;

    const { error } = await supabase
      .from("analytics_widgets")
      .update(updatePayload)
      .eq("id", parsed.data.widgetId)
      .eq("organization_id", org.id);

    if (error) {
      console.error("updateWidget error:", error);
      return { error: "Failed to update widget" };
    }
  } catch (err) {
    console.error("updateWidget unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.analytics);
  return {};
}
