"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { deletePlannerEntrySchema } from "../schemas/planner-entry.schema";
import { resolvePlannerActionItems } from "../services/resolve-planner-action-item";

export async function deletePlannerEntryAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireOrg();

  if (!canDo(ctx, "planner.entry.delete")) {
    return { error: "You don't have permission to delete inbox entries" };
  }

  const parsed = deletePlannerEntrySchema.safeParse({
    entryId: formData.get("entryId"),
  });
  if (!parsed.success) return { error: "Invalid inbox entry" };

  const supabase = await createClient();
  const { data: suggestions } = await supabase
    .from("planner_suggestions")
    .select("id")
    .eq("planner_entry_id", parsed.data.entryId)
    .eq("organization_id", ctx.org.id);

  const { error } = await supabase
    .from("planner_entries")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", parsed.data.entryId)
    .eq("organization_id", ctx.org.id)
    .neq("status", "archived");

  if (error) {
    console.error("[deletePlannerEntryAction] archive failed:", error.message);
    return { error: "Failed to delete inbox entry" };
  }

  await resolvePlannerActionItems(supabase, ctx, [
    parsed.data.entryId,
    ...(suggestions ?? []).map((suggestion) => suggestion.id),
  ]);

  revalidatePath(ROUTES.inbox);
  revalidatePath(ROUTES.actions);
  return {};
}
