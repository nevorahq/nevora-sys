import { NextResponse } from "next/server";
import { expireStaleSuggestions } from "@/modules/moneyflow/services/expire-stale-suggestions";
import { expireStalePlannerSuggestions } from "@/modules/planner/services/expire-stale-planner-suggestions";
import { logger } from "@/lib/observability/logger";

/**
 * Daily suggestions sweep. Two independent review queues age here:
 *   - money   (Phase 5.1 §4.4): expires pending money_ai_suggestions past the TTL.
 *   - planner (Phase B / B4):   reconciles crashed confirm claims, then expires
 *     orphaned (edge case #2) and stale planner_suggestions.
 *
 * The two run independently — one failing must not skip the other's work — and
 * the route reports 500 if either failed. Same fail-closed contract as the
 * extraction sweep: `CRON_SECRET` must be configured and presented as
 * `Authorization: Bearer <CRON_SECRET>`. Configured in vercel.json.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error("cron.suggestions_sweep.misconfigured", { reason: "CRON_SECRET not set" });
    return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [money, planner] = await Promise.all([
      expireStaleSuggestions(),
      expireStalePlannerSuggestions(),
    ]);
    const result = { ok: money.ok && planner.ok, money, planner };
    logger.info("cron.suggestions_sweep", { ...result });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    logger.error("cron.suggestions_sweep.threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  }
}
