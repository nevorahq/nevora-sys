"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitAuditLog } from "@/lib/events";
import { createNoteSchema } from "../schemas/crm.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

export async function createNoteAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, org } = await requireOrg();

  const rawData = {
    entity_type: formData.get("entity_type") as string,
    entity_id:   formData.get("entity_id") as string,
    content:     formData.get("content") as string,
  };

  const parsed = createNoteSchema.safeParse(rawData);
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

    const { data: newNote, error } = await supabase
      .from("crm_notes")
      .insert({
        organization_id: org.id,
        created_by:      user.id,
        ...parsed.data,
      })
      .select("id")
      .single();

    if (error || !newNote) {
      console.error("createNote error:", error);
      return { error: "Failed to create note" };
    }

    await emitAuditLog({
      organizationId: org.id,
      entityType:     "crm_notes",
      entityId:       newNote.id,
      action:         "create",
      newData:        { entity_type: parsed.data.entity_type, content_length: parsed.data.content.length },
      metadata:       { source: "dashboard" },
    });
  } catch (err) {
    console.error("createNote unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.crm);
  return {};
}
