import { NextResponse } from "next/server";
import { runAccountPurgeSweep } from "@/modules/settings/services/account-purge-worker";
import { logger } from "@/lib/observability/logger";

/**
 * Periodic hard-purge of accounts whose 30-day deletion grace window has passed.
 *
 * Because it permanently deletes users (and their solo organizations), it is
 * FAIL-CLOSED: `CRON_SECRET` must be configured and the caller must present it
 * as `Authorization: Bearer <CRON_SECRET>`. Registered as a machine route in
 * shared/config/routes.ts so the auth proxy lets it through unauthenticated,
 * and scheduled in vercel.json.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error("cron.account_purge.misconfigured", { reason: "CRON_SECRET not set" });
    return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAccountPurgeSweep();
    logger.info("cron.account_purge", { ...result });
    return NextResponse.json(result);
  } catch (error) {
    logger.error("cron.account_purge.threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Purge failed." }, { status: 500 });
  }
}
