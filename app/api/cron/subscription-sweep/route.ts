import { NextResponse } from "next/server";
import { sweepSubscriptionPaymentWorkflow } from "@/modules/subtracker/services/sweep-subscription-payment-workflow";
import { logger } from "@/lib/observability/logger";

/**
 * Daily subscription payment safety sweep (migration 078). Repairs missing
 * planned cycles and payment tasks for active subscriptions. Idempotent and
 * money-free — it never posts expenses or marks anything paid.
 *
 * Fail-closed like the other crons: `CRON_SECRET` must be set and presented as
 * `Authorization: Bearer <CRON_SECRET>`. Configured in vercel.json.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error("cron.subscription_sweep.misconfigured", { reason: "CRON_SECRET not set" });
    return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sweepSubscriptionPaymentWorkflow();
    logger.info("cron.subscription_sweep", { ...result });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    logger.error("cron.subscription_sweep.threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  }
}
