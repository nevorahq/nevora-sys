import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { listTaskProjectOptions } from "@/platform/tasks/server";
import type { ProjectCandidate } from "../utils/project-classification";

/**
 * The projects intent detection may file a capture under (ADR 002, 0.2b): the
 * organization's live projects, read through the Tasks platform adapter. A
 * failed read classifies nothing — it never fails the capture.
 */
export async function loadProjectCandidates(supabase: SupabaseClient, ctx: CurrentContext): Promise<ProjectCandidate[]> {
  try {
    const options = await listTaskProjectOptions(supabase, ctx.org.id);
    return options.map(({ id, name }) => ({ id, name }));
  } catch (error) {
    console.error("[loadProjectCandidates] failed:", error instanceof Error ? error.message : String(error));
    return [];
  }
}
