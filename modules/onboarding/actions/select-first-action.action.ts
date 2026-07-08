"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitDomainEvent } from "@/lib/events";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";
import { FIRST_ACTIONS, FIRST_ACTION_SOURCES } from "../types/onboarding.types";
import { ensureOnboardingProgress } from "../services/ensure-onboarding-progress";

const schema = z.object({
  firstAction: z.enum(FIRST_ACTIONS),
  /** Which surface the click came from — the B7 empty-state CTA rate depends on it. */
  source: z.enum(FIRST_ACTION_SOURCES).default("wizard"),
});

/**
 * Record which first action the user picked, starting the activation clock.
 *
 * Uses requireOrg rather than requireAppAccess on purpose: the funnel row is not
 * business data. Gating it on the write entitlement would stop an expired-trial
 * user from interacting with their own onboarding — see the RLS note in
 * migration 095.
 *
 * The user may change their mind while the entity does not exist yet; once it
 * does, the selection is frozen (the guard below), because the seeded draft is
 * already tied to that entity.
 *
 * The same guard makes this safe to call from the B6 empty-state CTAs, which fire
 * for every user — not just first-run ones. A completed or dismissed funnel is
 * never reopened, so `seconds_to_activation` and the funnel counts stay honest.
 */
export async function selectFirstActionAction(input: unknown): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Unknown first action" };

  const ctx = await requireOrg();
  const supabase = await createClient();

  const progress = await ensureOnboardingProgress(supabase, ctx);
  if (!progress) return { error: "Could not start onboarding" };

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("onboarding_progress")
    .update({ selected_first_action: parsed.data.firstAction, selected_at: now, updated_at: now })
    .eq("id", progress.id)
    .is("first_action_completed_at", null)
    .is("first_workflow_completed_at", null)
    .is("dismissed_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[selectFirstActionAction] update failed:", error.message);
    return { error: "Could not save your choice" };
  }
  // Past the entity step, already activated, or the wizard was skipped — the
  // selection is settled, not an error. The CTA still navigates.
  if (!updated) {
    revalidatePath(ROUTES.dashboard);
    return {};
  }

  await emitDomainEvent({
    organizationId: ctx.org.id,
    workspaceId: ctx.workspace.id,
    eventName: "onboarding.first_action_selected",
    aggregateType: "onboarding_progress",
    aggregateId: progress.id,
    payload: { first_action: parsed.data.firstAction, source: parsed.data.source },
  });

  revalidatePath(ROUTES.dashboard);
  return {};
}
