"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { rejectPlannerSuggestionSchema } from "../schemas/planner-suggestion.schema";
import { rejectPlannerSuggestion } from "../services/reject-planner-suggestion";

export async function rejectPlannerSuggestionAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireOrg();

  const parsed = rejectPlannerSuggestionSchema.safeParse({
    suggestionId: formData.get("suggestionId"),
    reason: (formData.get("reason") as string) || undefined,
  });
  if (!parsed.success) return { error: "Invalid rejection" };

  const supabase = await createClient();
  const result = await rejectPlannerSuggestion(supabase, ctx, parsed.data);
  if (!result.ok) return { error: result.error };

  revalidatePath(ROUTES.inbox);
  revalidatePath(ROUTES.actions);
  return {};
}
