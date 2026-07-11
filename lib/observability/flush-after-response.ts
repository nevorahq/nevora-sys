import "server-only";

import { after } from "next/server";

import { getMonitoring } from "./monitoring";

/**
 * Deliver queued monitoring events without blocking the response (caught lane).
 *
 * `@sentry/node` sends events over the network asynchronously. On serverless
 * (Netlify Functions) the platform can freeze the function the instant the
 * response is returned, dropping in-flight events before they leave the process.
 * `after()` schedules the flush to run once the response is finished while keeping
 * the function alive for the route's max duration — so the event actually ships,
 * and the user never waits on it.
 *
 * Called outside a request scope (e.g. a background script) `after()` throws; we
 * fall back to a best-effort fire-and-forget flush.
 */
export function flushMonitoringAfterResponse(timeoutMs = 2000): void {
  const flush = () => getMonitoring().flush(timeoutMs);
  try {
    after(flush);
  } catch {
    void flush();
  }
}
