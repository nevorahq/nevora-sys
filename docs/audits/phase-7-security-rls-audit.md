# Phase 7.2 — Security, Auth & RLS Audit

**Status:** Draft 1 — RLS deep pass complete
**Date:** 2026-07-02
**Codebase:** `main` @ `acdadd6`, migrations through `075`
**Scope:** Phase 7 plan §7.2 — organization data isolation, permission gating, storage, invites, cron/API surfaces.
**Relationship to §7.1:** closes the *conditional-P0* gap flagged in `phase-7-production-readiness-audit.md` §2/§7.

---

## 0. Headline

**No cross-organization data leakage was found.** The §7.1 conditional-P0 (a policy
trusting client-supplied `organization_id`, or a write policy missing an org
predicate) **did not materialize**. Isolation rests on a single well-used guard,
`public.is_org_member(uuid)` (`002_security_functions.sql:142`), applied across the
RLS surface, and every audited server action re-derives org context server-side.

**Security verdict for release: GREEN**, subject to the two env/ops confirmations
in §5 (production `CRON_SECRET`, signed-URL TTL) and the seat-limit item carried
over from §7.1 (P1-1), which is a *billing-integrity* concern, not an isolation one.

---

## 1. RLS surface — quantitative

| Metric | Value |
|---|---|
| Tables with `ENABLE ROW LEVEL SECURITY` | 79 |
| `CREATE POLICY` statements | 301 |
| Policies using `USING (true)` / `WITH CHECK (true)` | 5 — **all reviewed, all safe** (see §2) |
| `FORCE ROW LEVEL SECURITY` | 0 — *standard Supabase; see §4 note* |
| Core guard | `is_org_member(uuid)` — documented as used in ~48 policies (`037`) |

---

## 2. Open-policy review (`true` predicates)

Every `true` predicate was inspected. None expose tenant data.

| Location | Policy | Verdict |
|---|---|---|
| `003_rls_policies.sql:36` | `organizations_insert WITH CHECK (true)` | **Safe.** Creating an org you don't yet belong to; membership is added programmatically. An org with no membership is invisible (SELECT requires `is_org_member`). Minor hardening option in §3. |
| `013_plans_rls.sql:19` | `plans SELECT USING (true)` | **Safe** — public pricing catalog. |
| `050_exchange_rates.sql:61` | `exchange_rates SELECT USING (true)` | **Safe** — global reference data. |
| `071_…:165` | `plan_entitlements SELECT USING (true)` | **Safe** — public plan metadata. |
| `071_…:169` | `plan_limits SELECT USING (true)` | **Safe** — public plan metadata. |

No write policy anywhere uses a `true` predicate. ✅

---

## 3. Critical-check results (§7.2 checklist)

| Check | Result | Evidence |
|---|---|---|
| Authenticated user required | ✅ | `requireUser`/`requireOrg`; RPCs `RAISE 'not_authenticated'` on `auth.uid() IS NULL` |
| Organization membership enforced | ✅ | `is_org_member` in policies; RPCs re-check |
| Workspace scope | ✅ | `requireOrg` resolves workspace; actions pass `workspace.id` |
| Permission via role gate | ✅ | `authorizeSettingsAction` / `ROLE_PERMISSIONS` (`require-org.ts`) |
| **Admin-only actions gated server-side** | ✅ | `updateMemberRole` → `authorizeSettingsAction("members.update_role")`; `removeMemberAction` checks `roleId ∈ {owner,admin}` **before** mutating, all queries scoped to `org.id`, plus RLS backstop (handles `row-level security` error) |
| `organization_id` cannot be spoofed from client | ✅ | Write actions derive `org.id` from `requireOrg()`, never from `formData`. The only client-supplied org id (invite accept/decline) is validated by RPC — see §3.1 |
| User cannot read/write another org's entities | ✅ | No policy/route found that bypasses `is_org_member` |
| Storage buckets / paths | ✅ | Private bucket + path-scoped RLS — see §3.2 |
| API keys / webhooks org-scoped | ✅ | `authenticateApiKeyRequest` resolves org from key; developer services reserve/scope by org |
| Cron protected | ✅ (code) / ⚠️ (ops) | Fail-closed on `CRON_SECRET`; **must be set in prod** (§5) |

### 3.1 Invite flows — client-supplied `organizationId` is safe *(clears §7.1 P2-5)*

- `accept_invite(p_org_id)` (`025_member_invites.sql:115`) updates only
  `WHERE organization_id = p_org_id AND user_id = auth.uid() AND status = 'invited'`,
  and `RAISE 'invite_not_found'` if `NOT FOUND`. A caller can activate **only their
  own** invited membership. No cross-tenant path.
- `accept_invite_link(p_token)` (`027_trial_lifecycle.sql:206`) resolves org from a
  `pending`, non-expired token, checks `is_organization_writable`, then enforces a
  member cap. **Isolation-safe**, but the cap is a `COUNT(*)` check → concurrent link
  accepts can overshoot the seat limit → **same family as §7.1 P1-1** (billing, not
  isolation).

### 3.2 Storage — private + org-scoped

`039_documents_private_uploads.sql`:
- Bucket `documents` created with `public = false`, `file_size_limit = 10485760`,
  MIME allowlist (pdf/docx/png/jpeg/webp/heic/heif).
- `documents_storage_select`: `is_org_member((storage.foldername(name))[2]::uuid)`.
- `documents_storage_insert`: `can_write_data((storage.foldername(name))[2]::uuid)`
  and enforces the `documents/` prefix.
- Path layout `documents/{org}/{workspace}/{document}/{attachment}/{file}` makes the
  org UUID the RLS key. A leaked object path is still unreadable without active org
  membership. ✅

---

## 4. Findings

### No new P0 / P1 isolation issues.

The carried-over **P1-1** (member seat overshoot, §7.1 + §3.1 here) is the only
release-relevant item touching this area, and it is a **billing-integrity** race,
not a data-isolation defect.

### P3 / hardening (nice-to-have, not release-blocking)

- **H-1 · `FORCE ROW LEVEL SECURITY` not enabled.** Standard for Supabase — the app
  connects as `authenticated` (not table owner), so RLS applies; `SECURITY DEFINER`
  functions intentionally run as owner and carry explicit `is_org_member` guards.
  Enabling `FORCE` would add defense-in-depth against a future misconfigured
  owner-role connection. Low priority; document the decision either way.
- **H-2 · `organizations_insert WITH CHECK (true)`** lets a client create an
  orphan org row directly via PostgREST (invisible afterward, harmless). Optional:
  restrict INSERT to the `create_organization` RPC path only.
- **H-3 · Signed-URL TTL not verified.** Download routes issue signed URLs after
  `requireOrg`; confirm a short expiry (e.g. ≤ 60s) so a shared URL can't outlive
  the session. Verify in `app/api/documents/[documentId]/attachments/route.ts` and
  the task/subscription document routes.

---

## 5. Ops confirmations required before launch (feeds §7.11)

- [ ] **`CRON_SECRET` set in production.** Without it, all 3 crons fail-closed with
      503 — extraction/suggestions/reminders silently stop. (Correct security
      posture, but an availability trap if the env var is missing.)
- [ ] **Signed-URL TTL** confirmed short (H-3).
- [ ] **Storage bucket `documents`** exists in prod with `public = false` (migration
      applied). Same for the avatar bucket (`066`).

---

## 6. Recommended security regression tests (feeds §7.10)

These lock the isolation guarantees this pass verified by reasoning:

- [ ] User A cannot `SELECT`/`UPDATE`/`DELETE` org B's rows for each core table
      (`todos`, `documents`, `money_transactions`, `subscriptions`, `entity_links`,
      `memberships`) — direct PostgREST call as A with B's ids.
- [ ] User A cannot read org B's storage object even with the exact path.
- [ ] Non-admin cannot `updateMemberRole` / `removeMember` / billing actions
      (server action returns forbidden, RLS blocks the underlying mutation).
- [ ] `accept_invite` with another user's org id is a no-op (`invite_not_found`).
- [ ] Cron endpoint returns 401 without the bearer secret, 503 when unset.
- [ ] Developer API key from org A cannot read org B via `/api/v1/*`.

---

## 7. Definition of Done — §7.2 status

| DoD item | Status |
|---|---|
| Cross-organization data leakage impossible by RLS | ✅ (no leak found; §2, §3) |
| Admin-only actions closed server-side | ✅ (§3, `updateMemberRole`/`removeMember`) |
| Billing/usage mutations protected | ✅ isolation-wise; ⚠️ seat race = P1-1 (billing) |
| File/document access scoped by organization | ✅ (§3.2) |
| API keys / webhooks scoped by organization | ✅ |
| Security tests pass | ⛔ **not yet written** — see §6 (recommended next action) |

**§7.2 exit recommendation:** Isolation is release-ready. Two open threads before
this section is fully "green": **(a)** write the §6 security regression tests, and
**(b)** resolve **P1-1** as part of §7.3 (billing/usage hardening). Proceed to §7.3.
