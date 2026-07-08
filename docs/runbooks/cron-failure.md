# Runbook — Cron Failure

**Severity:** P2 (P1 if `trial-sweep` or `subscription-sweep` is down for >24h).

## 0. The five cron routes

| Route | Job | Consequence if down |
|---|---|---|
| `/api/cron/reminders` | due/overdue reminders | users stop being nudged |
| `/api/cron/extraction-sweep` | document OCR backlog | documents never reach review |
| `/api/cron/subscription-sweep` | opens missing cycles + payment tasks | payment tasks stop appearing |
| `/api/cron/suggestions-sweep` | AI suggestion generation | no new suggestions |
| `/api/cron/trial-sweep` | consumes expired trials | expired trials keep write access |

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

Then read the platform's cron execution log for the scheduled run.

| Observed | Meaning |
|---|---|
| 503 in logs | `CRON_SECRET` not set in this environment |
| 401 in logs | Scheduler is sending the wrong secret |
| 200 but nothing happened | Job ran, batch was empty, or it filtered everything |
| Timeout | Batch too large, or a downstream API (Anthropic) is slow |
| No invocation at all | Not scheduled in `vercel.json` |

## 2. Fix

1. **Missing secret** → set `CRON_SECRET` in Production scope, redeploy.
2. **Not scheduled** → add to `vercel.json`; confirm the path matches the route.
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

- [ ] Unauthenticated `curl` → non-200 for all five routes.
- [ ] An authenticated manual run returns 200 and logs what it did.
- [ ] Running it twice in a row changes nothing the second time (idempotent).
- [ ] ⚑ `subscription-sweep` created **no** `money_transactions` row.
- [ ] `trial-sweep` moved only genuinely expired trials.

## 5. Escalate

If a cron route ever returns **200 without a secret**, treat it as P0: an
unauthenticated caller can drive cross-org, service-role work. Rotate
`CRON_SECRET` and audit recent invocations.
