"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { ROUTES } from "@/shared/config/routes";
import { trackServerEvent } from "@/modules/cookie-consent/server";
import type { ActionResult } from "@/lib/validators/common";
import { createPlannerEntrySchema } from "../schemas/planner-entry.schema";
import { createPlannerEntry } from "../services/create-planner-entry";
import { processPlannerEntry } from "../services/process-planner-entry";
import { getInboxErrors, messageForCode, rawTextFieldErrors } from "./inbox-errors";

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
  const errors = await getInboxErrors();
  if (!canDo(ctx, "planner.entry.create")) {
    return { error: errors.forbidden };
  }

  const parsed = createPlannerEntrySchema.safeParse({
    rawText: formData.get("rawText"),
    entryType: (formData.get("entryType") as string) || "text",
  });

  if (!parsed.success) {
    return { fieldErrors: rawTextFieldErrors(errors, parsed.error.issues) };
  }

  const supabase = await createClient();
  const result = await createPlannerEntry(supabase, ctx, {
    rawText: parsed.data.rawText,
    entryType: parsed.data.entryType,
  });

  if (!result.ok) return { error: messageForCode(errors, result.code, "captureFailed") };

  // Synchronous processing keeps the MVP simple; detection degrades gracefully
  // and never throws, so a capture is never lost even if the AI is unavailable.
  await processPlannerEntry(supabase, ctx, result.entry);
  await trackServerEvent(ctx.user.id, "inbox_entry_captured", {
    organization_id: ctx.org.id,
    entry_type: parsed.data.entryType,
    source: "web",
  });

  revalidatePath(ROUTES.inbox);
  return {};
}
