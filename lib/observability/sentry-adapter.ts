import type { MonitoringContext, MonitoringSink } from "./monitoring";

/**
 * Sentry adapter for the monitoring seam (Phase 2 — observability).
 *
 * Deliberately provider-thin: it maps our `MonitoringContext` onto Sentry's
 * capture API and nothing else. Both `@sentry/node` (server/edge) and
 * `@sentry/browser` (client) expose the same `captureException` /
 * `captureMessage` shape, so one adapter serves every runtime — the concrete
 * SDK is injected by `instrumentation.ts` / `instrumentation-client.ts`, which
 * is also where `Sentry.init(...)` runs.
 *
 * We use the SDKs' own global handlers for *uncaught* errors (installed by
 * `Sentry.init`), so this adapter is invoked for the *caught* lane (`reportError`)
 * and Next's `onRequestError` bridge — see docs/observability/sentry-setup.md.
 */

/** The minimal Sentry surface the adapter needs. `@sentry/node` and
 *  `@sentry/browser` both satisfy this structurally. */
export interface SentryCaptureApi {
  captureException(error: unknown, captureContext?: Record<string, unknown>): string;
  captureMessage(message: string, captureContext?: Record<string, unknown>): string;
  /** Both `@sentry/node` and `@sentry/browser` expose this. Resolves `true` when
   *  the queue drained, `false` on timeout. */
  flush(timeout?: number): Promise<boolean>;
}

/** Build the Sentry scope (tags + extra) from our context. `event` becomes a
 *  searchable tag; `diagnosticId` + fields go to `extra` for log correlation. */
function toCaptureContext(context?: MonitoringContext): Record<string, unknown> {
  return {
    tags: context?.event ? { event: context.event } : undefined,
    extra: {
      ...(context?.diagnosticId ? { diagnosticId: context.diagnosticId } : {}),
      ...(context?.fields ?? {}),
    },
  };
}

export function createSentrySink(sentry: SentryCaptureApi): MonitoringSink {
  return {
    captureException(error, context) {
      sentry.captureException(error, toCaptureContext(context));
    },
    captureMessage(message, level, context) {
      sentry.captureMessage(message, { level, ...toCaptureContext(context) });
    },
    flush(timeoutMs) {
      return sentry.flush(timeoutMs);
    },
  };
}
