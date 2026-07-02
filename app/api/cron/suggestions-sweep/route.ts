import { NextResponse } from "next/server";
import { expireStaleSuggestions } from "@/modules/moneyflow/services/expire-stale-suggestions";
import { logger } from "@/lib/observability/logger";

/**
 * Daily suggestions sweep (Phase 5.1 §4.4): expires pending
 * money_ai_suggestions older than 30 days. Same fail-closed contract as the
 * extraction sweep — `CRON_SECRET` must be configured and presented as
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
    const result = await expireStaleSuggestions();
    logger.info("cron.suggestions_sweep", { ...result });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    logger.error("cron.suggestions_sweep.threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  }
}
