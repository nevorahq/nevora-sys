import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { detectPlannerIntent, type DetectPlannerIntentOptions } from "./detect-planner-intent";
import { loadProjectCandidates } from "./load-project-candidates";
import { loadEntrySignals, matchProjectRule } from "./project-rules";
import { stampProjectProvenance } from "../utils/project-rule-signals";
import type { PlannerIntentDetectionResult } from "../types/planner.types";

/**
 * Intent detection for a stored capture, with its project decided rule-first,
 * AI second (ADR 002, 0.2b): the user's learned rule for the capture's source
 * wins; only without one does the model see the project list. Every draft is
 * stamped with where its project came from, so accepting it can learn.
 */
export async function detectCaptureIntent(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  entryId: string,
  text: string,
  options: Omit<DetectPlannerIntentOptions, "projects"> = {},
): Promise<PlannerIntentDetectionResult> {
  const projects = await loadProjectCandidates(supabase, ctx);
  const rule = await matchProjectRule(
    supabase,
    ctx,
    await loadEntrySignals(supabase, ctx, entryId),
    new Set(projects.map((project) => project.id)),
  );
  const detection = await detectPlannerIntent(text, { ...options, projects: rule ? [] : projects });
  return stampProjectProvenance(detection, rule);
}
