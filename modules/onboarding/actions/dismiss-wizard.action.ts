"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent } from "@/lib/events";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { wizardStep } from "../types/onboarding.types";
import { ensureOnboardingProgress } from "../services/ensure-onboarding-progress";

/**
 * Skip the wizard (Phase B edge case #6).
 *
 * Dismissal hides the wizard, it does not cancel the funnel: a draft already
 * seeded stays in the Action Center, and the four first actions remain reachable
 * from their own modules. Recording which step the user bailed at is what turns
 * "people skip onboarding" into "people skip onboarding *here*".
 */
export async function dismissWizardAction(): Promise<ActionResult> {
  const ctx = await requireOrg();
  const supabase = await createClient();

  const progress = await ensureOnboardingProgress(supabase, ctx);
  if (!progress) return { error: "Could not update onboarding" };

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("onboarding_progress")
    .update({ dismissed_at: now, updated_at: now })
    .eq("id", progress.id)
    .is("dismissed_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[dismissWizardAction] update failed:", error.message);
    return { error: "Could not dismiss the wizard" };
  }

  if (updated) {
    await emitDomainEvent({
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      eventName: "onboarding.dismissed",
      aggregateType: "onboarding_progress",
      aggregateId: progress.id,
      payload: { step: wizardStep(progress) },
    });
  }

  revalidatePath(ROUTES.dashboard);
  return {};
}
