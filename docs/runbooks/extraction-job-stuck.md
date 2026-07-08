# Runbook — Extraction Job Stuck

**Severity:** P2. Documents upload fine but never produce a review item.

## 0. What extraction may and may not do

Extraction reads a document and produces a **draft / review item**. It never posts
a money transaction. If you are debugging "extraction posted an expense", that is
a **P0 invariant break**, not a stuck job — see
`docs/contracts/financial-workflows.md`.

## 1. Triage

Extraction state lives on `public.document_extractions` (migration 051), **not** on
`documents`. Status is one of `pending` · `processing` · `completed` · `failed` ·
`needs_review`.

```sql
SELECT id, document_id, provider, status, error_code, error_message,
       confidence_score, started_at, updated_at
FROM public.document_extractions
WHERE organization_id = '<org>'
  AND status NOT IN ('completed', 'failed', 'needs_review')
  AND updated_at < now() - interval '30 minutes'
ORDER BY updated_at;
```

| Stuck state | Meaning |
|---|---|
| `pending` and never picked up | The sweep is not running, or not seeing the row |
| `processing` for a long time | The job died mid-flight; no lease expiry |
| `failed` | Ran and failed — read `error_code` / `error_message`; not "stuck" |
| `needs_review` | Ran, low confidence. **Working as designed** — a human must review. |

## 2. Causes

| Cause | Check |
|---|---|
| Cron not running | `/api/cron/extraction-sweep` — is it scheduled in `vercel.json`? |
| Cron rejecting | It is **fail-closed**: no `CRON_SECRET` ⇒ 503, wrong secret ⇒ 401. A 503 in logs means the env var is missing, not that the job failed. |
| `ANTHROPIC_API_KEY` missing / rate-limited | The sweep triggers billed AI spend; it refuses to run unconfigured. |
| `DOCUMENT_EXTRACTION_MOCK` set in prod | Extraction "succeeds" with mock data. Must be unset in production. |
| Batch cap | The sweep processes a bounded batch per run. A backlog drains over several runs — that is not stuck. |
| Corrupt / unsupported file | Should land in `failed` with a reason, and surface "needs review" in the UI. |

## 3. Fix

1. Confirm the cron is scheduled **and** authenticated:
   `curl -i https://<host>/api/cron/extraction-sweep` → must be **non-200**
   (that proves fail-closed). Then check the platform's cron execution log for a
   200 from the scheduled invocation.
2. If the job died mid-flight, reset the stuck rows for one org, in a transaction:
   `processing` → `pending`, then let the next sweep pick them up. Never reset to
   `completed` — that fabricates an extraction result.
3. If the file is genuinely unprocessable, move it to `failed` with an
   `error_code` / `error_message` so the user gets a "needs review" action item
   rather than silence.

The sweep is **cross-org** and therefore uses the service role. That is one of the
sanctioned exceptions. It must stay scoped, idempotent, and logged.

## 4. Verify

- [ ] A newly uploaded document reaches `completed` or `failed` within one cycle.
- [ ] A `failed` document surfaces a "needs review" item in the Action Center.
- [ ] Re-running the sweep does not duplicate drafts (idempotent).
- [ ] ⚑ No `money_transactions` row was created by the sweep.

## Related

- `docs/runbooks/cron-failure.md`
- `docs/runbooks/missing-action-center-item.md`
- `docs/contracts/financial-workflows.md`
