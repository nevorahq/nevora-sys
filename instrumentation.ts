import type { Instrumentation } from "next";

import { logger } from "@/lib/observability/logger";
import { getMonitoring, setMonitoringSink } from "@/lib/observability/monitoring";

/**
 * Server instrumentation (Phase 2 — observability).
 *
 * `register` runs once per server instance; `onRequestError` fires for every
 * *uncaught* server error Next captures — RSC renders, route handlers, server
 * actions, and the proxy. Caught errors take the other lane (`reportError`).
 * Both lanes funnel into the same vendor-neutral seam (`getMonitoring()`), so
 * the provider is wired in one place without touching call sites.
 */

export async function register(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  // The minimal activation uses @sentry/node, which is Node-only. The Edge
  // runtime (proxy/middleware) keeps the no-op sink — acceptable for Phase 2.
  if (process.env.NEXT_RUNTIME === "edge") {
    logger.warn("monitoring.edge_runtime_unmonitored", {
      note: "Edge runtime keeps the no-op sink; @sentry/node is Node-only.",
    });
    return;
  }

  const Sentry = await import("@sentry/node");
  Sentry.init({
    dsn,
    // Errors + alerts only for Phase 2 — no APM/tracing, no PII by default.
    tracesSampleRate: 0,
    sendDefaultPii: false,
    environment: process.env.NODE_ENV,
  });

  const { createSentrySink } = await import("@/lib/observability/sentry-adapter");
  setMonitoringSink(createSentrySink(Sentry));

  logger.info("monitoring.initialized", {
    provider: "sentry",
    runtime: process.env.NEXT_RUNTIME ?? "nodejs",
  });
}

export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  const digest = (err as { digest?: unknown }).digest;
  getMonitoring().captureException(err, {
    event: "next.request.error",
    ...(typeof digest === "string" ? { diagnosticId: digest } : {}),
    fields: {
      path: request.path,
      method: request.method,
      routerKind: context.routerKind,
      routeType: context.routeType,
      routePath: context.routePath,
    },
  });
};
