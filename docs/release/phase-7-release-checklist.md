# Phase 7.11 — Production Release Checklist

> ⚠️ **SUPERSEDED (2026-07-08).** Use
> [`release-checklist.md`](./release-checklist.md).
>
> Kept for history. Its migration section stops at `077`; the current baseline is
> `000`–`097` (next free `098`). It also predates the Phase A scope gate (paused
> CRM/Booking) and the Action Center-first dashboard. **Do not run this document.**

**Status:** Superseded by `release-checklist.md`
**Date:** 2026-07-02
**Target:** first controlled production release (Phase 7.12 beta)
**Stack:** Next.js 16 (Vercel) · Supabase (Postgres + Auth + Storage) · Resend
(email) · Anthropic (document OCR) · web-push (VAPID)

Run top-to-bottom before deploying. Do not skip the migration-order or env
sections.

---

## 1. Environment variables (verify in Vercel Production)

| Var | Purpose | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client auth | public |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side privileged ops | **secret**, server only |
| `CRON_SECRET` | protects all 3 cron routes | **secret** — see §4; missing = crons 503 |
| `ANTHROPIC_API_KEY` | document extraction OCR | **secret**; billed |
| `DOCUMENT_EXTRACTION_MOCK` | mock OCR in non-prod | **must be unset/false in prod** |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | invite / notification email | secret + verified sender |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | web push | keypair matched |
| `RUN_DB_TESTS` | gate DB tests | leave unset in prod |

- [ ] Every secret above set in **Production** scope (not just Preview).
- [ ] `DOCUMENT_EXTRACTION_MOCK` is **off** in production.
- [ ] No secret is exposed via a `NEXT_PUBLIC_` name by mistake.

**Billing note:** paid billing remains private-beta gated until Paddle runtime is configured. Billing is an
internal trial/plan model (`billing_subscriptions` + `plan_limits`). No payment
webhook/secret checklist applies. When a provider is added, extend this section.

---

## 2. Supabase — database

Migration order (apply in ascending number; **076 & 077 are new this release**):

```
… 072_phase6_atomic_usage
   073_notification_delivery
   074_notification_tab_indicator
   075_reminder_schedules_and_attention_counters
   076_phase7_member_seat_atomicity        ← Phase 7.3 (P1-1)
   077_phase7_data_integrity_hardening      ← Phase 7.4 (indexes)
```

- [ ] `supabase db push` (or migrate) applied through **077**.
- [ ] `supabase db lint` clean.
- [ ] **RLS enabled** on all tables (79 confirmed; §7.2).
- [ ] Reconcile: **zero orgs without a `billing_subscriptions` row**
      (query in `docs/billing/usage-model.md` §5) — else backfill a trial.
- [ ] Usage counters match live counts (drift query, same doc).
- [ ] Seat trigger present: `enforce_member_seat_limit` on `memberships`.

## 3. Supabase — storage

- [ ] Bucket `documents` exists, `public = false`, 10 MB limit, MIME allowlist (`039`).
- [ ] Bucket for avatars exists per `066`, private.
- [ ] Storage RLS policies present (path-scoped `is_org_member`/`can_write_data`).
- [ ] **Signed-URL TTL** short (≤ 60s) on document download routes (§7.2 H-3).

## 4. Cron (Vercel)

3 crons in `vercel.json`: `extraction-sweep` (*/10), `suggestions-sweep` (0 3),
`reminders` (*/5). All **fail-closed** on `CRON_SECRET`.

- [ ] `CRON_SECRET` set — otherwise all crons return 503 and automation stalls.
- [ ] Cron schedules present in the deployed `vercel.json`.
- [ ] One manual authorized hit of each returns 200 (smoke).

## 5. Vercel — app

- [ ] Production branch = release branch; build green.
- [ ] `next build` output reviewed — no unexpected route/runtime changes.
- [ ] Middleware/`proxy.ts` behaves (auth redirects).
- [ ] Error logging drain reads the structured JSON logs (§7.5).

## 6. Observability / monitoring (ready BEFORE traffic)

- [ ] Log drain captures `billing.*`, `cron.*`, `documents.upload.*` events.
- [ ] Alerts armed per `docs/observability/logging-and-errors.md` §4
      (`billing.release.failed` = any; cron `.threw`; 5xx rate).
- [ ] `global-error.tsx` + route boundaries deployed (no raw errors in UI).

## 7. Accounts

- [ ] An internal admin/owner org exists for the §7.12 smoke test.
- [ ] Invite email deliverability verified (Resend sender domain).

---

## 8. Go / No-Go

Ship only when **all** are true (Phase 7 Release Rule):

```
Security green (§7.2)          ✅
Billing/usage green (§7.3)     ✅
Data integrity green (§7.4)    ✅ (apply 076/077)
Uploads green (§7.7)           ✅
Core modules green (§7.10)     ✅
Build green (§7.10)            ✅
Rollback ready (§7.11)         → docs/release/phase-7-rollback-plan.md
No P0/P1 open                  ✅
```

Env verified · migrations through 077 applied · `CRON_SECRET` set ·
`DOCUMENT_EXTRACTION_MOCK` off · monitoring armed → **GO**.
