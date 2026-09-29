# Phase 7.12 — Beta Release / Controlled Launch Plan

**Status:** Draft 1
**Date:** 2026-07-02
**Precondition:** §7.11 release checklist GO + migrations `076`/`077` applied.

Roll out in stages; do not skip to public. Each step gates the next.

---

## Step 1 — Internal production smoke test (1 org)

Deploy to production; exercise every module with one internal org on **real infra**
(not mock).

- [ ] Org + workspace + trial subscription provisioned automatically (onboarding).
- [ ] Create task / money transaction / transfer / subscription — each persists,
      counters increment.
- [ ] Upload a PDF, a photo (heic/jpg) — extraction runs (or is queued);
      **subscription attachment creates no money transaction**.
- [ ] Cross-module relation created and visible in the relation viewer.
- [ ] Hit a plan limit → message shows **usage/limit numbers** (§7.9).
- [ ] Invite a second member → seat cap enforced; role change / remove work.
- [ ] Force an error → boundary shows friendly copy + reference id, log has it.
- [ ] Admin can read `billing.*` / `cron.*` / upload events in the log drain.

Exit: all green, no P0/P1.

## Step 2 — Private beta (2–5 trusted orgs)

- [ ] Manual onboarding; known limits explained up front.
- [ ] Daily error-log review (alerts armed per §7.5/§7.11).
- [ ] Watch `billing.release.failed` (must stay 0), cron health, upload success.
- [ ] Collect feedback; triage into P0/P1 (fix now) vs P2 (backlog).
- [ ] Confirm counters stay accurate under real usage (drift query weekly).

Exit: no P0/P1 from beta; counters accurate; uploads reliable.

## Step 3 — Release candidate

- [ ] No P0/P1 open.
- [ ] Core flows stable across all beta orgs.
- [ ] Performance acceptable on real data (revisit PERF-1/2/3 if lists feel slow).
- [ ] Billing states correct (trial → active/expired transitions behave).
- [ ] Docs ready (this set + product copy).

## Step 4 — Public soft launch

- [ ] Landing page + pricing live; trial signup path stable.
- [ ] Onboarding path stable (self-serve org creation).
- [ ] Support/contact path available.
- [ ] Consider closing the pre-launch gaps first: list pagination (PERF-1/3),
      global read-only switch (§7.11), remaining `loading.tsx` (UX-1).

---

## Success metrics (Phase 7 "done")

- Users create & manage business data **without support intervention**.
- Cross-module relations stable.
- Billing/usage limits **accurate** (no drift, no overshoot).
- Upload/document flows reliable (no orphans — P2-4 fixed).
- No known critical security issues (§7.2 GREEN).
- No P0/P1 open; P2 catalogued (§7.10 §3).
- Production deploy has a rollback plan (§7.11).
- System observable enough to debug real incidents (§7.5).

---

## Phase 7 completion status (roll-up)

| § | Area | State |
|---|---|---|
| 7.1 | Production readiness audit | ✅ done |
| 7.2 | Security / RLS | ✅ GREEN |
| 7.3 | Billing / usage atomicity | ✅ all P1 fixed (migration 076) |
| 7.4 | Data integrity | ✅ indexes (migration 077) |
| 7.5 | Observability / errors | ✅ helper + global-error + structured logs |
| 7.6 | Performance | ✅ pass (indexes); PERF-1/2/3 → §7.9 |
| 7.7 | Uploads / storage | ✅ P2-4 rollback fixed |
| 7.8 | Automation / events | ✅ documented; already idempotent |
| 7.9 | UX polish | ✅ limit copy + core skeletons; UX-1/2/3 follow-ups |
| 7.10 | Regression / gates | ✅ green; known issues documented |
| 7.11 | Release ops / rollback | ✅ checklist + rollback plan |
| 7.12 | Beta launch | ✅ this plan — execute after 076/077 applied |

**Blocking before public:** apply migrations `076`/`077` to remote, run the §7.11
checklist, and complete Steps 1–2. The 🧪 integration-test gaps (§7.10) and the
follow-ups above are recommended but not P0/P1.
