import { setMonitoringSink } from "@/lib/observability/monitoring";

/**
 * Client instrumentation (Phase 2 — observability).
 *
 * Runs after the document loads but before React hydration, so it captures the
 * earliest client failures. When `NEXT_PUBLIC_SENTRY_DSN` is set we initialize
 * `@sentry/browser` — its own global handlers catch uncaught errors and
 * unhandled rejections, so we do NOT add manual `window` listeners (that would
 * double-report). We also install the sink so any manual `getMonitoring()`
 * capture on the client reaches Sentry. See docs/observability/sentry-setup.md.
 *
 * The import is dynamic and guarded by the DSN so the SDK is only pulled into
 * the bundle when monitoring is actually configured.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void (async () => {
    try {
      const Sentry = await import("@sentry/browser");
      Sentry.init({
        dsn,
        // Errors + alerts only for Phase 2 — no tracing/replay, no PII by default.
        tracesSampleRate: 0,
        sendDefaultPii: false,
        environment: process.env.NODE_ENV,
      });
      const { createSentrySink } = await import("@/lib/observability/sentry-adapter");
      setMonitoringSink(createSentrySink(Sentry));
    } catch {
      /* never let monitoring init break the page */
    }
  })();
}
