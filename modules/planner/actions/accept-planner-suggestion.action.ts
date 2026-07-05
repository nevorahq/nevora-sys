"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { acceptPlannerSuggestionSchema } from "../schemas/planner-suggestion.schema";
import { acceptPlannerSuggestion } from "../services/accept-planner-suggestion";

export async function acceptPlannerSuggestionAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireOrg();

  const parsed = acceptPlannerSuggestionSchema.safeParse({
    suggestionId: formData.get("suggestionId"),
  });
  if (!parsed.success) return { error: "Invalid suggestion" };

  const supabase = await createClient();
  const result = await acceptPlannerSuggestion(supabase, ctx, parsed.data.suggestionId);
  if (!result.ok) return { error: result.error };

  // The accept may have created a task / financial task / link / action item —
  // revalidate the surfaces that could now show it.
  revalidatePath(ROUTES.inbox);
  revalidatePath(ROUTES.actions);
  revalidatePath(ROUTES.tasks);
  revalidatePath(ROUTES.dashboard);
  return {};
}
