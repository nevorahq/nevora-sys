import { NextResponse } from "next/server";
import { reconcileUsageCounters } from "@/modules/billing/services/reconcile-usage-counters";
import { logger } from "@/lib/observability/logger";

/**
 * Usage-counter reconciliation sweep (Sprint 5 — S5.2). Detects drift between the
 * cached `organization_usage_counters` and the authoritative live counts; reports
 * every discrepancy and repairs only when `USAGE_RECONCILE_REPAIR` is enabled.
 *
 * Fail-closed like the other crons: `CRON_SECRET` must be set and presented as
 * `Authorization: Bearer <CRON_SECRET>`. Scheduled by the Netlify function of the
 * same basename.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error("cron.usage_reconcile.misconfigured", { reason: "CRON_SECRET not set" });
    return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await reconcileUsageCounters();
    logger.info("cron.usage_reconcile", { ...result });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    logger.error("cron.usage_reconcile.threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Reconcile failed." }, { status: 500 });
  }
}
