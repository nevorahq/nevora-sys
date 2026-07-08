# Phase 7.11 — Rollback Plan

> ⚠️ **SUPERSEDED (2026-07-08).** Use [`rollback-plan.md`](./rollback-plan.md)
> (strategy) and [`../runbooks/rollback.md`](../runbooks/rollback.md) (procedure).
>
> Kept for history. Scoped to migrations `076`/`077`; the current baseline is
> `000`–`093`.

**Status:** Superseded by `rollback-plan.md`
**Date:** 2026-07-02
**Scope:** how to safely undo the Phase 7 release (app + migrations `076`/`077`).

---

## 0. Principles

- **App rollback is instant and safe** (Vercel redeploy of the previous build).
- **The Phase 7 migrations are backward-compatible** — the *previous app* runs
  fine against a database that has `076`/`077` applied. So you can roll back the
  app **without** touching the database in almost all cases.
- Prefer app-only rollback. Only touch the DB if a migration itself is the fault.

---

## 1. App rollback (Vercel)

1. Vercel → Deployments → select the last known-good deployment → **Promote to
   Production** (or `vercel rollback`).
2. Verify: dashboard loads, a create action works, a cron returns 200.

**Compatibility:** the previous app does not know about the seat trigger or the new
indexes, but neither breaks it — the trigger only *adds* an enforcement the old app
also wanted (member cap), and indexes are transparent. **No DB change needed to
roll back the app.**

---

## 2. Migration reversibility

| Migration | Reversible? | How to undo (only if it is the fault) |
|---|---|---|
| `077_phase7_data_integrity_hardening` | **Yes, safely** | `DROP INDEX` each: `documents_org_updated_idx`, `documents_org_entity_idx`, `domain_events_org_created_idx`, `domain_events_aggregate_idx`, `document_attachments_org_idx`, `document_attachments_document_idx`. Additive indexes — dropping only affects performance. |
| `076_phase7_member_seat_atomicity` | **Yes, safely** | `DROP TRIGGER enforce_member_seat_limit ON public.memberships; DROP FUNCTION public.enforce_member_seat_limit();`. Removes the atomic seat cap; the app-level `checkPlanLimit('members')` pre-check still applies (reverts to Phase 6 behavior). |

Both are **safe to leave in place** during an app rollback. Neither drops or
mutates data.

### Not safely reversible
None introduced in Phase 7. (Earlier migrations that backfill/alter data are not
in this release's delta and are already live.)

---

## 3. Targeted disable switches

If one subsystem misbehaves, disable it without a full rollback:

- **Crons:** rotate/unset `CRON_SECRET` in Vercel → all 3 crons immediately 503
  (fail-closed). Stops extraction/suggestions/reminders without a deploy. Re-set to
  resume. (Note: this stops *all* crons, not one.)
- **Document extraction / AI spend:** set `DOCUMENT_EXTRACTION_MOCK` or remove
  `ANTHROPIC_API_KEY` → extraction degrades to no-op; uploads still work (extraction
  is `after()`/cron, never blocks the upload).
- **A specific cron** only: remove its entry from `vercel.json` and redeploy.

---

## 4. Read-only / degraded mode

There is no global read-only flag, but the billing writability guard already
provides one per org: a subscription in a non-writable state
(`is_organization_writable = false`) blocks mutations while **keeping reads**. To
force an org read-only in an incident, set its `billing_subscriptions.status` to a
non-writable value. A global switch is a **recommended future addition** (a
feature-flag env checked in the mutation guards).

---

## 5. Manual cleanup scripts (post-incident)

- **Counter drift** (if a bug leaked reservations): recompute from live rows —
  `recalculateOrganizationUsage` exists in `billing-service.ts`, or run the drift
  query in `docs/billing/usage-model.md` §5 and correct.
- **Orphaned storage/documents** (pre-P2-4 uploads): use the orphan queries in
  `docs/audits/phase-7-data-integrity-audit.md` §4 to find and soft-delete.
- **Orgs without subscription:** backfill a trial (`init_trial_subscription`).

---

## 6. Rollback decision tree

```
Incident?
├─ App bug (UI/action) ............... Vercel rollback (§1). DB untouched.
├─ Migration 076/077 suspected ....... Vercel rollback + DROP the trigger/indexes (§2).
├─ Runaway AI/cron spend ............. Unset CRON_SECRET / ANTHROPIC_API_KEY (§3).
├─ One org compromised/abusing ....... Force that org read-only (§4).
└─ Data corruption ................... Stop writes (§3/§4) → run cleanup (§5) → RCA.
```

---

## 7. Definition of Done — §7.11 status

| DoD item | Status |
|---|---|
| Release deployable predictably | ✅ (checklist) |
| Rollback path documented | ✅ (this doc) |
| Migrations reviewed for reversibility | ✅ (§2 — both safely reversible) |
| Critical env vars verified | ✅ (checklist §1) |
| Monitoring ready before release | ✅ (checklist §6) |

**Gap flagged:** no *global* read-only switch — per-org degradation exists; a
global feature flag is recommended before scaling beyond the controlled beta.
