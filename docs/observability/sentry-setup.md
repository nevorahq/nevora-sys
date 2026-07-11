# Error Monitoring Setup (Sentry) — Phase 2

**Owner:** Platform
**Status:** **ACTIVE** — minimal core-SDK integration (`@sentry/node` + `@sentry/browser`) wired through the monitoring seam.
**Related:** `docs/observability/logging-and-errors.md`

External error monitoring is live via a vendor-neutral seam. This documents how
it is wired, its intentional limits, and how to verify it.

---

## How it's wired

- **`lib/observability/monitoring.ts`** — vendor-neutral sink.
  `getMonitoring()` returns the active sink; `setMonitoringSink(adapter)` installs
  the provider; `isMonitoringConfigured()` reports DSN presence only. The sink is
  **fail-safe** — a provider that throws can never surface into the request path.
- **`lib/observability/sentry-adapter.ts`** — `createSentrySink(sentry)` maps our
  `MonitoringContext` onto Sentry's `captureException` / `captureMessage`
  (`event` → tag, `diagnosticId` + fields → `extra`). One adapter serves both
  runtimes because `@sentry/node` and `@sentry/browser` share that surface.
- **Server** — `instrumentation.ts` `register()` reads `SENTRY_DSN`, and on the
  Node runtime runs `Sentry.init(...)` then `setMonitoringSink(createSentrySink(Sentry))`.
  `onRequestError` bridges every **uncaught** server error (RSC / route / action /
  proxy) into the seam.
- **Client** — `instrumentation-client.ts` reads `NEXT_PUBLIC_SENTRY_DSN` and, when
  set, dynamically imports and inits `@sentry/browser`. Its **own global handlers**
  catch uncaught client errors + unhandled rejections, so we deliberately do **not**
  add manual `window` listeners (that would double-report).
- **Caught** errors → `reportError` (`lib/observability/report-error.ts`) already
  calls `getMonitoring().captureException(...)`, so every server-action / route
  `catch` reaches Sentry with no per-site change.

### Env

```
SENTRY_DSN=…              # server/edge; Node runtime only in this minimal setup
NEXT_PUBLIC_SENTRY_DSN=…  # exposed to the browser; client errors
```

Both are set in `.env.local` (2026-07-10) and in **Netlify** project env
(Site configuration → Environment variables) for the deployed environment
(2026-07-11). After adding them, trigger a redeploy so the new build picks them
up. Leave either blank to disable that side.

---

## Intentional limits (minimal scope)

Chosen to keep zero risk against this bleeding-edge Next 16 fork (`AGENTS.md`):

- **No `@sentry/nextjs` build plugin** — `next.config.ts` is untouched, no
  `SENTRY_AUTH_TOKEN`, no Turbopack/webpack plugin that could break the fork build.
- **No source maps upload** — production **client** stack traces are minified.
  Server stack traces pass through as-is (original `Error`).
- **No tracing / APM / session replay** — `tracesSampleRate: 0`. Errors + alerts only.
- **Edge runtime is unmonitored** — `@sentry/node` is Node-only; the proxy/middleware
  keeps the no-op sink and logs `monitoring.edge_runtime_unmonitored`.
- **`sendDefaultPii: false`** + the app's existing redaction (masked emails,
  redacted filenames). The seam does **not** redact — keep `context.fields` PII-safe.

### Edge runtime coverage — decision (2026-07-11): stay unmonitored, by design

`proxy.ts` (Next 16's renamed middleware) runs on the **Edge runtime**; on Netlify
that is a **Deno** Edge Function, where `@sentry/node` cannot load. The proxy is
thin — Supabase session refresh plus auth/route gating — and its failures surface
as redirects or 5xx in Netlify's Edge Function logs. Proper edge capture would need
Sentry's **Deno/edge** SDK, a separate effort that neither the current seam nor the
Vercel-oriented `@sentry/nextjs` edge cleanly serves on Netlify. Everything with
business/money logic (server actions, route handlers, RSC) runs on Node and **is**
covered. **Decision: accept the edge no-op as a documented limitation; revisit only
if edge errors become an observed blind spot** — do not re-architect the seam for it.

### If richer data is needed later → upgrade to `@sentry/nextjs`

`@sentry/nextjs@^10` supports Next `^16`. To add source maps + tracing: install it,
wrap `next.config.ts` with `withSentryConfig`, set `SENTRY_AUTH_TOKEN` + org/project,
and replace the two `Sentry.init` calls. The seam/adapter stay as-is.

> **Note (2026-07-11):** the `@sentry/nextjs` install wizard was run once and
> **reverted** — it hardcoded the DSN in source, set `tracesSampleRate: 1`, added
> throwaway example routes, and duplicated the seam's init while leaving its own
> `sentry.*.config.ts` inert. The vendor-neutral seam is the deliberate choice;
> adopt `@sentry/nextjs` only as an intentional migration, never via the wizard.
> (On Netlify its edge support is Vercel-oriented and still would not cover the
> Deno proxy — see the edge decision above.)

---

## Alerts

Wire Sentry alert rules to the release-critical events in
`logging-and-errors.md` §4 (`billing.release.failed`, `cron.*.threw`,
`documents.upload.failed`, 5xx on `/api/*`). Exclude `billing.reserve.denied` — it
is expected (users hitting plan limits).

---

## Verifying it works

1. Start the server fresh (register runs once at boot) and confirm the log line
   `{"event":"monitoring.initialized","provider":"sentry"}`.
2. Throw a test error from a server action and from a client component.
3. Confirm both appear in Sentry with the `event` tag and `diagnosticId` / `digest`
   matching the structured log line (log ↔ Sentry correlation).
4. Remove the test throws.
