# Runbook — Cron Failure

**Severity:** P2 (P1 if `trial-sweep` or `subscription-sweep` is down for >24h).

## 0. The eight cron routes

Each route is triggered by a Netlify Scheduled Function in
`netlify/functions/<name>.mts` (`export const config = { schedule }`), a thin
wrapper that calls the route with `Authorization: Bearer $CRON_SECRET`.
Schedules and owners: [`release/job-reliability-register.md`](../release/job-reliability-register.md).

| Route | Job | Consequence if down |
|---|---|---|
| `/api/cron/reminders` | due/overdue reminders | users stop being nudged |
| `/api/cron/extraction-sweep` | document OCR backlog | documents never reach review |
| `/api/cron/subscription-sweep` | opens missing cycles + payment tasks | payment tasks stop appearing |
| `/api/cron/suggestions-sweep` | AI suggestion generation | no new suggestions |
| `/api/cron/trial-sweep` | consumes expired trials | expired trials keep write access |
| `/api/cron/action-items-sweep` | reconciles Action Center items | stale or missing attention items |
| `/api/cron/purge-deleted-accounts` | purges accounts past the 30-day window | deletion requests never complete |
| `/api/cron/usage-reconcile` | compares usage counters with reality | limit drift goes unnoticed |

All are **fail-closed**: no `CRON_SECRET` ⇒ 503; wrong secret ⇒ 401. They run
cross-org and therefore use the service role — a sanctioned exception. Each must
stay **scoped, idempotent, and logged**.

**None of them post money.** `subscription-sweep` is repair-only: it opens planned
cycles and payment tasks, and never marks anything paid.

## 1. Is it actually failing?

A 401/503 seen from your own `curl` is **correct** — that is the gate working.
What matters is the *scheduled* invocation's result.

```sh
# Must NOT be 200. If it is 200, CRON_SECRET is not enforced → P0.
curl -i https://<host>/api/cron/reminders
```

Then read the scheduled run in Netlify → Functions → `<name>` → logs
(`netlify logs:function` needs an interactive terminal).

| Observed | Meaning |
|---|---|
| 503 in logs | `CRON_SECRET` not set in this environment |
| 401 in logs | Scheduler is sending the wrong secret |
| 200 but nothing happened | Job ran, batch was empty, or it filtered everything |
| Timeout | Batch too large, or a downstream API (Anthropic) is slow |
| No invocation at all | No `schedule` in `netlify/functions/<name>.mts`, the site is not deploying (e.g. the Netlify account is suspended), or the function file is missing |

## 2. Fix

1. **Missing secret** → set `CRON_SECRET` in Netlify with scope *functions* and
   *runtime*, then redeploy — env changes do not reach a running deploy.
2. **Not scheduled** → add a `netlify/functions/<name>.mts` wrapper with a
   `schedule` (copy an existing one); confirm the path matches the route.
3. **Timeout** → the sweeps are batch-capped. A backlog drains over successive
   runs; that is by design, not a failure. If a single batch times out, lower the
   batch limit rather than raising the timeout.
4. **Downstream failure** (`extraction-sweep` / `suggestions-sweep`) → check
   `ANTHROPIC_API_KEY` validity and rate limits. These jobs cost money; they
   refuse to run unconfigured on purpose.

## 3. Re-running safely

Every sweep is idempotent. Re-running is safe and is the normal recovery path.

To trigger by hand:

```sh
curl -i -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/subscription-sweep
```

Do this once and read the result. Do not loop.

## 4. Verify

- [ ] Unauthenticated `curl` → non-200 for all eight routes.
- [ ] An authenticated manual run returns 200 and logs what it did.
- [ ] Running it twice in a row changes nothing the second time (idempotent).
- [ ] ⚑ `subscription-sweep` created **no** `money_transactions` row.
- [ ] `trial-sweep` moved only genuinely expired trials.

## 5. Escalate

If a cron route ever returns **200 without a secret**, treat it as P0: an
unauthenticated caller can drive cross-org, service-role work. Rotate
`CRON_SECRET` and audit recent invocations.
