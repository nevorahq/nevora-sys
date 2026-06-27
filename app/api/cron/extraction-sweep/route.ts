import { NextResponse } from "next/server";
import { runExtractionSweep } from "@/modules/documents/services/extraction-worker";
import { logger } from "@/lib/observability/logger";

/**
 * Periodic extraction sweep (durability safety net for the `after()` fast path).
 *
 * Recovers stuck jobs cross-org: see {@link runExtractionSweep}. Because it can
 * trigger AI spend, it is FAIL-CLOSED — `CRON_SECRET` must be configured and the
 * caller must present it as `Authorization: Bearer <CRON_SECRET>`. Vercel Cron
 * sends this header automatically when the env var is set; any external
 * scheduler can hit it the same way. Configured in vercel.json.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error("cron.extraction_sweep.misconfigured", { reason: "CRON_SECRET not set" });
    return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runExtractionSweep();
    logger.info("cron.extraction_sweep", { ...result });
    return NextResponse.json(result);
  } catch (error) {
    logger.error("cron.extraction_sweep.threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  }
}
