import { NextResponse } from "next/server";
import { consumeExpiredTrials } from "@/modules/billing/services/consume-expired-trials";
import { logger } from "@/lib/observability/logger";

/**
 * Daily trial lifecycle sweep (migration 086). Expires overdue trialing
 * subscriptions and marks their billing_trial_claims consumed, so a used
 * trial can never be re-activated. Idempotent.
 *
 * Fail-closed like the other crons: `CRON_SECRET` must be set and presented
 * as `Authorization: Bearer <CRON_SECRET>`. Configured in vercel.json.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error("cron.trial_sweep.misconfigured", { reason: "CRON_SECRET not set" });
    return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await consumeExpiredTrials();
    logger.info("cron.trial_sweep", { ...result });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    logger.error("cron.trial_sweep.threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  }
}
