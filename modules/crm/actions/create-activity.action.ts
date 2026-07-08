"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitAuditLog } from "@/lib/events";
import { createActivitySchema } from "../schemas/crm.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { assertPausedModuleAction } from "@/shared/config/paused-modules";

export async function createActivityAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // CRM is paused for the private beta. A "use server" export stays
  // reachable over POST even while its page 404s — gate the mutation itself.
  assertPausedModuleAction("crm");

  const { user, org } = await requireOrg();

  const rawData = {
    entity_type:   formData.get("entity_type") as string,
    entity_id:     formData.get("entity_id") as string,
    activity_type: formData.get("activity_type") as string,
    title:         formData.get("title") as string,
    description:   (formData.get("description") as string) || null,
    scheduled_at:  (formData.get("scheduled_at") as string) || null,
  };

  const parsed = createActivitySchema.safeParse(rawData);
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

    const { data: newActivity, error } = await supabase
      .from("crm_activities")
      .insert({
        organization_id: org.id,
        created_by:      user.id,
        ...parsed.data,
      })
      .select("id")
      .single();

    if (error || !newActivity) {
      console.error("createActivity error:", error);
      return { error: "Failed to create activity" };
    }

    await emitAuditLog({
      organizationId: org.id,
      entityType:     "crm_activities",
      entityId:       newActivity.id,
      action:         "create",
      newData:        { activity_type: parsed.data.activity_type, entity_type: parsed.data.entity_type },
      metadata:       { source: "dashboard" },
    });
  } catch (err) {
    console.error("createActivity unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.crm);
  return {};
}
