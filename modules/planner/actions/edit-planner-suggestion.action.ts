"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { editPlannerSuggestionSchema } from "../schemas/planner-suggestion.schema";
import { editPlannerSuggestion } from "../services/edit-planner-suggestion";
import { getInboxErrors, messageForCode } from "./inbox-errors";

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
        return { error: (await getInboxErrors()).invalid };
      }
    } catch {
      return { error: (await getInboxErrors()).invalid };
    }
  }

  const parsed = editPlannerSuggestionSchema.safeParse({
    suggestionId: formData.get("suggestionId"),
    title: (formData.get("title") as string) || undefined,
    description: formData.has("description") ? (formData.get("description") as string) : undefined,
    suggestionType: (formData.get("suggestionType") as string) || undefined,
    proposedPayload,
  });
  // The review form shows one message, not per-field errors.
  if (!parsed.success) return { error: (await getInboxErrors()).invalid };

  const supabase = await createClient();
  const result = await editPlannerSuggestion(supabase, ctx, parsed.data);
  if (!result.ok) return { error: messageForCode(await getInboxErrors(), result.code, "editFailed") };

  revalidatePath(ROUTES.inbox);
  return {};
}
