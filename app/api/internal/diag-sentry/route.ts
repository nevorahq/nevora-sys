import { NextResponse } from "next/server";
import { reportError } from "@/lib/observability/report-error";
import { logger } from "@/lib/observability/logger";

/**
 * TEMPORARY — Sentry deployed-smoke probe (Phase 2 tail / I-09 visibility check).
 *
 * Delete this folder AND its `MACHINE_ROUTES` entry once
 * `docs/release/phase-3-sentry-visibility-check.md` is signed off. It exists only
 * to produce ONE controlled server error on the deployed environment so a
 * `diagnosticId` can be correlated to a Sentry event.
 *
 * Fail-closed exactly like the other internal/cron routes: no `METRICS_SECRET`
 * configured → refuse. Not publicly triggerable.
 *
 *   # caught lane (default): the response carries the diagnosticId to find in Sentry
 *   curl -H "Authorization: Bearer $METRICS_SECRET" <host>/api/internal/diag-sentry
 *
 *   # uncaught lane: bubbles to instrumentation.ts onRequestError; find the digest
 *   # in the Netlify function log for this request, then match it in Sentry
 *   curl -H "Authorization: Bearer $METRICS_SECRET" "<host>/api/internal/diag-sentry?mode=throw"
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.METRICS_SECRET;
  if (!secret) {
    logger.error("diag.sentry.misconfigured", { reason: "METRICS_SECRET not set" });
    return NextResponse.json({ error: "Diagnostics are not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const mode = new URL(request.url).searchParams.get("mode") === "throw" ? "throw" : "caught";
  const error = new Error(`diag: Sentry deployed smoke (${mode}) ${nonce}`);

  if (mode === "throw") {
    // Uncaught lane: Next assigns a `digest`, calls instrumentation.ts
    // onRequestError → Sentry (event "next.request.error", diagnosticId = digest).
    // The digest is in the Netlify function log for this request.
    throw error;
  }

  // Caught lane (default): reportError logs a diagnosticId AND forwards it to the
  // monitoring seam (Sentry tag event="diag.sentry.smoke", extra.diagnosticId).
  // We echo it so a single curl yields the id to search for in Sentry.
  const { diagnosticId } = reportError("diag.sentry.smoke", error, {
    fields: { nonce, mode },
  });
  return NextResponse.json(
    { ok: true, lane: "caught", event: "diag.sentry.smoke", diagnosticId, nonce },
    { status: 200 },
  );
}
