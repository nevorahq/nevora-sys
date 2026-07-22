import { NextResponse } from "next/server";
import { sweepActionItems } from "@/modules/action-center/services/sweep-action-items";
import { logger } from "@/lib/observability/logger";

/**
 * Durable Action Center generation sweep (Sprint 3 — unit 3.2). Materializes
 * action items for every writable org so attention exists independently of a
 * feed page view. Idempotent, money-free, notification-free.
 *
 * Fail-closed like the other crons: `CRON_SECRET` must be set and presented as
 * `Authorization: Bearer <CRON_SECRET>`. Scheduled by the Netlify function of
 * the same basename.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error("cron.action_items_sweep.misconfigured", { reason: "CRON_SECRET not set" });
    return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sweepActionItems();
    logger.info("cron.action_items_sweep", { ...result });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    logger.error("cron.action_items_sweep.threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  }
}
