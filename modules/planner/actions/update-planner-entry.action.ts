"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { updatePlannerEntrySchema } from "../schemas/planner-entry.schema";

export async function updatePlannerEntryAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireOrg();

  if (!canDo(ctx, "planner.entry.update")) {
    return { error: "You don't have permission to edit inbox entries" };
  }

  const parsed = updatePlannerEntrySchema.safeParse({
    entryId: formData.get("entryId"),
    rawText: formData.get("rawText"),
  });
  if (!parsed.success) {
    return { error: "Invalid inbox entry", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("planner_entries")
    .update({
      raw_text: parsed.data.rawText,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.entryId)
    .eq("organization_id", ctx.org.id)
    .neq("status", "archived");

  if (error) {
    console.error("[updatePlannerEntryAction] update failed:", error.message);
    return { error: "Failed to update inbox entry" };
  }

  revalidatePath(ROUTES.inbox);
  return {};
}
