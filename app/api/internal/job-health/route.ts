import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getJobHealth } from "@/modules/billing/queries/get-job-health";
import { logger } from "@/lib/observability/logger";

/**
 * Background-job health diagnostic (Sprint 5 — S5.3 follow-up). A read-only,
 * cross-org snapshot of stuck jobs + recent terminal failures (reminders,
 * extraction, system automations), for the team.
 *
 * Fail-closed like the activation funnel: `METRICS_SECRET` must be set and
 * presented as `Authorization: Bearer <METRICS_SECRET>`. Aggregate-only.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.METRICS_SECRET;
  if (!secret) {
    logger.error("job_health.misconfigured", { reason: "METRICS_SECRET not set" });
    return NextResponse.json({ error: "Metrics are not configured." }, { status: 503 });
  }
  if (!hasValidBearerSecret(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await getJobHealth();
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.configured ? 500 : 503 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error("job_health.threw", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Could not read job health." }, { status: 500 });
  }
}

/** Hash to fixed-length buffers before comparing so token length/content do not leak through timing. */
function hasValidBearerSecret(authorization: string | null, secret: string): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const supplied = createHash("sha256").update(authorization.slice(7), "utf8").digest();
  const expected = createHash("sha256").update(secret, "utf8").digest();
  return timingSafeEqual(supplied, expected);
}
