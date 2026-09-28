import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { logger } from "@/lib/observability/logger";

/**
 * Record one AI intent detection in the shared monthly AI quota (ADR 002, 0.2).
 *
 * The ai_requests INSERT is the atomic quota guard: the start_limit_ai_requests
 * trigger (033/059) rejects it once the organization's ai_calls quota is used up,
 * exactly as for transaction categorization. The row is written as completed —
 * it stands for "one model call spent", whatever that call returns.
 *
 * Returns false when the quota (or writability) denies the call; the capture then
 * falls back to the no-AI normalizer, so a capture is never lost to a limit.
 */
export async function reserveCaptureAiCall(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  plannerEntryId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("ai_requests").insert({
    organization_id: ctx.org.id,
    user_id: ctx.user.id,
    action_type: "capture_intent",
    status: "completed",
    completed_at: now,
    metadata: { planner_entry_id: plannerEntryId },
  });

  if (!error) return true;

  logger.warn("planner.capture_ai.quota_denied", {
    organizationId: ctx.org.id,
    code: error.code,
    message: error.message,
  });
  return false;
}
