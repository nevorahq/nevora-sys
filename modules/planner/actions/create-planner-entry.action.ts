"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { createPlannerEntrySchema } from "../schemas/planner-entry.schema";
import { createPlannerEntry } from "../services/create-planner-entry";
import { processPlannerEntry } from "../services/process-planner-entry";

/**
 * Capture a raw entry and immediately run intent detection so a suggestion is
 * ready for review on the next render. Money is never touched here — detection
 * only produces reviewable suggestions.
 */
export async function createPlannerEntryAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (!canDo(ctx, "planner.entry.create")) {
    return { error: "You don't have permission to capture entries" };
  }

  const parsed = createPlannerEntrySchema.safeParse({
    rawText: formData.get("rawText"),
    entryType: (formData.get("entryType") as string) || "text",
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
  const result = await createPlannerEntry(supabase, ctx, {
    rawText: parsed.data.rawText,
    entryType: parsed.data.entryType,
  });

  if (!result.ok) return { error: result.error };

  // Synchronous processing keeps the MVP simple; detection degrades gracefully
  // and never throws, so a capture is never lost even if the AI is unavailable.
  await processPlannerEntry(supabase, ctx, result.entry);

  revalidatePath(ROUTES.inbox);
  return {};
}
