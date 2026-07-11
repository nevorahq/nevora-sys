# Phase 3 — Sentry visibility check (log ↔ Sentry correlation)

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

- [ ] `SENTRY_DSN` set in the Netlify project env (server). *(set 2026-07-11)*
- [ ] `NEXT_PUBLIC_SENTRY_DSN` set in the Netlify project env (browser). *(set 2026-07-11)*
- [ ] Latest deploy picked up both (redeploy after setting env, if needed).

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

## Correlation record (fill one row per error you correlate)

| # | Origin (server / client) | Scenario that produced it | `diagnosticId` (from log/UI) | `digest` (if any) | Seen in Sentry? | Tag `event` present? | Values match? |
|---|---|---|---|---|---|---|---|
| 1 | server | | | | ☐ | ☐ | ☐ |
| 2 | client | | | | ☐ | ☐ | n/a | ☐ |

**Check passes when:** at least one server error and one client error each appear
in Sentry, carry the `event` tag (server) / originate from the browser SDK
(client), and their `diagnosticId` (or `digest`) matches the value observed
outside Sentry. Record the two Sentry event permalinks in the proof report.

**If it fails** (event missing, or `diagnosticId` doesn't match): the `event`↔log
correlation is broken. This blocks the evidence contract for every Part A
scenario — resolve it before treating any I-09 `diagnosticId` as verified.
