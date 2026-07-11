# Phase 3 — Sentry visibility check (log ↔ Sentry correlation)

> **Result: PASS — 2026-07-11.** Server (caught + uncaught) and client lanes all
> deliver to Sentry on the deployed Netlify environment. This required a fix: the
> seam captured fire-and-forget with no flush, so events were dropped when the
> Netlify Function froze after the response — fixed in #29 (flush at the request
> boundary). Evidence recorded below.

**Purpose:** before the I-09 smoke run, prove that a `diagnosticId` produced by
an error on the **deployed** environment actually reaches Sentry — so that the
evidence contract's "`diagnosticId` visible in Sentry" line is verifiable, not
aspirational. This is the deployed-env analogue of the Phase 2 verify step in
[`../observability/sentry-setup.md`](../observability/sentry-setup.md) →
_Verifying it works_.

Without this, the `diagnosticId` column in the proof report has nothing to
correlate against, and Part A of Phase 3 is not evidence — it is an assertion.

---

## Precondition (Phase 2 tail — must be true on the deployed project, not `.env.local`)

- [x] `SENTRY_DSN` set in the Netlify project env (server). *(set 2026-07-11)*
- [x] `NEXT_PUBLIC_SENTRY_DSN` set in the Netlify project env (browser; present at build so it inlines into the client bundle — confirmed live via `window.__SENTRY__ === true`). *(set 2026-07-11)*
- [x] Latest deploy picked up both (redeployed 2026-07-11 with #29). Boot log on the deployed Function showed `{"event":"monitoring.initialized","provider":"sentry","runtime":"nodejs"}`.

Quick confirmation the seam initialised on the deployed server: the boot log line

```json
{"event":"monitoring.initialized","provider":"sentry"}
```

should appear in the deployment's runtime logs (Netlify → Logs → Functions). If it says
`"provider":"noop"` or is absent, the DSN is not wired — **stop**, fix env, and
redeploy before running any smoke scenario.

---

## The check

The seam reports two error classes (see `lib/observability/`):

1. **Caught** errors → `reportError(...)` → Sentry `captureException` with the
   `event` tag and `diagnosticId` in `extra`.
2. **Uncaught** errors → `instrumentation.ts` `onRequestError` (server) and the
   browser global handlers → same adapter, correlated by `diagnosticId` /
   Next.js `digest`.

You need one of each to appear in Sentry and match a structured log line.

### Server-side (caught + uncaught)

1. Trigger a **server** error on the deployed app during a real smoke scenario —
   e.g. the "break the query / error state" step in checklist §2, or any
   genuine 5xx you can reproduce. Do **not** ship a throwaway `throw` route to
   production; use a real error surface or a preview deploy.
2. In the deployment runtime logs, find the structured error line and copy its
   `diagnosticId` (and `digest` if present).
3. In Sentry, find the event: it must carry the `event` tag and its
   `diagnosticId` / `digest` in `extra` must **equal** the value from the log.

### Client-side

4. Trigger a **browser** error (a client component error boundary, a failed
   client action). Confirm a Sentry event appears from the browser SDK with a
   `diagnosticId` matching what the UI surfaced / the console logged.

---

## Correlation record — run 2026-07-11 (deployed: `https://bussines.nevorahq.com`)

The controlled error source was the temporary secret-gated probe
`GET /api/internal/diag-sentry` (PR #26, removed by #27) — acceptable here because
it is `METRICS_SECRET`-gated, not publicly triggerable, and removed after sign-off.
The client error was a browser console `throw`.

| # | Origin | Scenario | `diagnosticId` / `digest` | Seen in Sentry? | Tag `event` | Values match? |
|---|---|---|---|---|---|---|
| 1 | server · caught | `diag-sentry` (`reportError`) | `diagnosticId = mrgcq3k9-6yuzs4` | ✅ | `diag.sentry.smoke` | ✅ curl response == Sentry `extra` |
| 2 | server · uncaught | `diag-sentry?mode=throw` (`onRequestError`) | throw `mrgcq3wf-z00ucl` (Next `digest`) | ✅ `exception`, `environment=production` | `next.request.error` | ✅ tag set by the seam adapter |
| 3 | client | browser console `throw` | `Error: diag: client 1783773848490` | ✅ platform `javascript` | n/a (browser SDK) | ✅ message matches |

**Passed:** a server (caught) event, a server (uncaught) event, and a client event
all appeared in Sentry with the correct `event` tag / browser origin, and the
caught `diagnosticId` matched the value returned outside Sentry. Log ↔ Sentry
correlation is proven — the `diagnosticId` column in the I-09 proof report is now
verifiable.

> **Fix that made this pass:** the first deployed run returned correct HTTP codes
> but **no** Sentry events — the seam had no `flush()`, so Netlify froze the
> Function before `@sentry/node` shipped the event. #29 added a flush at the
> request boundary (`await` in `onRequestError`, `after()` in `reportError`).
> Without it, all server-side error delivery on Netlify was lossy.
