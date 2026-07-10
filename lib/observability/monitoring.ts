/**
 * Vendor-neutral error-monitoring seam (Phase 2 — observability).
 *
 * The app already does two things on every failure: it logs a structured event
 * (`logger`) and returns a safe `{ diagnosticId }` to the user (`reportError`).
 * This module adds the *second destination* those failures should reach — an
 * external error monitor (Sentry, or any drain) that alerts on spikes and keeps
 * stack traces for diagnosis.
 *
 * Design goals:
 *   - **Zero dependency until a DSN exists.** No provider SDK is imported here,
 *     so the build, typecheck, and tests stay green while monitoring is
 *     un-provisioned. The default sink does nothing.
 *   - **No call-site churn when it lands.** Both error lanes already funnel
 *     through this seam — caught errors via `reportError`, uncaught errors via
 *     `onRequestError` in `instrumentation.ts`. Activating Sentry is one adapter
 *     file plus one `setMonitoringSink(...)` call in instrumentation; the 260+
 *     existing `catch` sites never change.
 *   - **Isomorphic + fail-safe.** Safe to import from the server, the edge
 *     runtime, and client instrumentation. A sink must never throw into its
 *     caller — monitoring cannot be allowed to break the thing it monitors.
 *
 * When a DSN arrives, follow `docs/observability/sentry-setup.md`.
 */

export type MonitoringLevel = "warning" | "error" | "fatal";

export interface MonitoringContext {
  /** Stable dotted event name, e.g. "documents.upload.failed". */
  event?: string;
  /** Short id already shown to the user and written to the log line. */
  diagnosticId?: string;
  /**
   * Extra structured fields. Must already be PII-safe — this seam does not
   * redact. Apply the same discipline as the logger (see the redaction policy).
   */
  fields?: Record<string, unknown>;
}

export interface MonitoringSink {
  captureException(error: unknown, context?: MonitoringContext): void;
  captureMessage(message: string, level: MonitoringLevel, context?: MonitoringContext): void;
}

/** Default sink: does nothing. Active until a provider adapter is installed. */
const noopSink: MonitoringSink = {
  captureException() {},
  captureMessage() {},
};

let activeSink: MonitoringSink = noopSink;

/**
 * Returns the active monitoring sink. Today this is always the no-op sink.
 *
 * Callers use it unconditionally: `getMonitoring().captureException(err, ctx)`.
 * That call is free until an adapter is installed, and starts forwarding to the
 * provider the moment one is — with no change at the call site.
 */
export function getMonitoring(): MonitoringSink {
  return activeSink;
}

/**
 * Installs a monitoring sink. Call once, from instrumentation, only when a DSN
 * is configured. Passing `null` restores the no-op sink.
 *
 * The sink is wrapped so a provider failure can never surface into the request
 * path.
 */
export function setMonitoringSink(sink: MonitoringSink | null): void {
  activeSink = sink ? guard(sink) : noopSink;
}

/**
 * Is an external monitor configured for this runtime? Presence-only — never
 * returns or logs the DSN itself. `SENTRY_DSN` covers the server/edge runtimes;
 * `NEXT_PUBLIC_SENTRY_DSN` is the only one visible in the browser bundle.
 */
export function isMonitoringConfigured(): boolean {
  return Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
}

function guard(sink: MonitoringSink): MonitoringSink {
  return {
    captureException(error, context) {
      try {
        sink.captureException(error, context);
      } catch {
        /* monitoring must never throw into the caller */
      }
    },
    captureMessage(message, level, context) {
      try {
        sink.captureMessage(message, level, context);
      } catch {
        /* monitoring must never throw into the caller */
      }
    },
  };
}
