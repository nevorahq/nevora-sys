"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { editPlannerSuggestionSchema } from "../schemas/planner-suggestion.schema";
import { editPlannerSuggestion } from "../services/edit-planner-suggestion";

/**
 * Edit a pending suggestion. Accepts title/description edits from a simple form;
 * proposed_payload edits (when provided) must be a JSON object string.
 */
export async function editPlannerSuggestionAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireOrg();

  let proposedPayload: Record<string, unknown> | undefined;
  const rawPayload = formData.get("proposedPayload");
  if (typeof rawPayload === "string" && rawPayload.trim()) {
    try {
      const parsed = JSON.parse(rawPayload);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        proposedPayload = parsed as Record<string, unknown>;
      } else {
        return { error: "Payload must be a JSON object" };
      }
    } catch {
      return { error: "Payload is not valid JSON" };
    }
  }

  const parsed = editPlannerSuggestionSchema.safeParse({
    suggestionId: formData.get("suggestionId"),
    title: (formData.get("title") as string) || undefined,
    description: formData.has("description") ? (formData.get("description") as string) : undefined,
    suggestionType: (formData.get("suggestionType") as string) || undefined,
    proposedPayload,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  const supabase = await createClient();
  const result = await editPlannerSuggestion(supabase, ctx, parsed.data);
  if (!result.ok) return { error: result.error };

  revalidatePath(ROUTES.inbox);
  return {};
}
