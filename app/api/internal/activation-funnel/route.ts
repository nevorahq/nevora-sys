import { NextResponse } from "next/server";
import { getActivationFunnel, DEFAULT_WINDOW_DAYS } from "@/modules/onboarding/queries/get-activation-funnel";
import { getActivationMilestones } from "@/modules/onboarding/queries/get-activation-milestones";
import { logger } from "@/lib/observability/logger";

/**
 * Phase B / B7 — the activation funnel, for the team building the product.
 *
 * Not a customer-facing screen: an activation rate for a single tenant is a sample
 * of one, and the numbers only mean something across organizations. So this reads
 * cross-org with the service role and is gated by a shared secret rather than by a
 * user session.
 *
 * Fail-closed, exactly like the cron routes: with no `METRICS_SECRET` configured
 * the endpoint refuses to answer rather than defaulting to open. The response
 * carries aggregates only — no user ids, no org ids, no content.
 *
 *   curl -H "Authorization: Bearer $METRICS_SECRET" <host>/api/internal/activation-funnel?days=30
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_WINDOW_DAYS = 365;

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.METRICS_SECRET;
  if (!secret) {
    logger.error("activation_funnel.misconfigured", { reason: "METRICS_SECRET not set" });
    return NextResponse.json({ error: "Metrics are not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = parseWindow(new URL(request.url).searchParams.get("days"));

  try {
    const result = await getActivationFunnel(days);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.configured ? 500 : 503 });
    }
    // Full-product milestones (Sprint 6 / S6.2) alongside the first-action funnel.
    // Aggregate-only; a milestone read failure must not fail the funnel response.
    const milestonesResult = await getActivationMilestones(days);
    return NextResponse.json(
      { ...result, milestones: milestonesResult.ok ? milestonesResult.milestones : null },
      { status: 200 },
    );
  } catch (error) {
    logger.error("activation_funnel.threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Could not read the funnel." }, { status: 500 });
  }
}

/** A malformed window is a caller mistake, not a reason to scan a year of rows. */
function parseWindow(raw: string | null): number {
  if (!raw) return DEFAULT_WINDOW_DAYS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_WINDOW_DAYS;
  return Math.min(parsed, MAX_WINDOW_DAYS);
}
