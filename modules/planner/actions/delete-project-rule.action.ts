"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";

/**
 * Settings → Integrations → Project rules: the user deletes one of THEIR OWN
 * learned rules. RLS (migration 125) allows exactly that; the owner filter
 * keeps the intent explicit.
 */
export async function deleteProjectRuleAction(ruleId: string): Promise<{ ok: boolean }> {
  const parsed = uuidSchema.safeParse(ruleId);
  if (!parsed.success) return { ok: false };

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ intent: "read" });
  } catch (error) {
    if (isAccessError(error)) return { ok: false };
    throw error;
  }

  const { error } = await (await createClient())
    .from("capture_project_rules")
    .delete()
    .eq("id", parsed.data)
    .eq("organization_id", ctx.org.id)
    .eq("owner_user_id", ctx.user.id);
  if (error) {
    console.error("[deleteProjectRuleAction] failed:", error.message);
    return { ok: false };
  }
  revalidatePath(ROUTES.settingsIntegrations);
  return { ok: true };
}
