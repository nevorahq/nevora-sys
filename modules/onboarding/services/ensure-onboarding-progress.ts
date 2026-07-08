import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { ONBOARDING_PROGRESS_COLUMNS, type OnboardingProgress } from "../types/onboarding.types";

/**
 * Read this user's funnel row, creating it on first sight.
 *
 * The insert is racy by nature — the Action Center renders on every navigation
 * and two parallel requests can both find nothing. `upsert` on the
 * (organization_id, user_id) unique key makes the loser of that race read the
 * winner's row instead of failing, and `ignoreDuplicates` keeps `started_at`
 * pinned to the first ever visit (which is what "time to first confirmed action"
 * is measured from).
 */
export async function ensureOnboardingProgress(
  supabase: SupabaseClient,
  ctx: CurrentContext,
): Promise<OnboardingProgress | null> {
  const existing = await readProgress(supabase, ctx);
  if (existing) return existing;

  const { error } = await supabase
    .from("onboarding_progress")
    .upsert(
      { organization_id: ctx.org.id, user_id: ctx.user.id },
      { onConflict: "organization_id,user_id", ignoreDuplicates: true },
    );

  if (error) {
    // Never break the dashboard over a funnel row.
    console.error("[ensureOnboardingProgress] upsert failed:", error.message);
    return null;
  }

  return readProgress(supabase, ctx);
}

export async function readProgress(
  supabase: SupabaseClient,
  ctx: CurrentContext,
): Promise<OnboardingProgress | null> {
  const { data, error } = await supabase
    .from("onboarding_progress")
    .select(ONBOARDING_PROGRESS_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  if (error) {
    console.error("[readProgress] select failed:", error.message);
    return null;
  }
  return (data as OnboardingProgress | null) ?? null;
}
