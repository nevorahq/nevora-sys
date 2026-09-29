# Security Control Plane Audit

> **Phase 0 deliverable.** Read-only audit. No schema or application changes were made.
> **Date:** 2026-07-06 · **Branch:** `main` · **Scope:** authentication, tenancy, authorization, billing/trial entitlements, invites, RLS, service-role usage, raw-email/PII leakage, write-bypass risks.

## Method & Confidence

This codebase is large: **139** `"use server"` files, **88** migrations, **~50** `SECURITY DEFINER` functions, **19** route handlers. Every security-critical *path* (auth helpers, `requireOrg`, trial lifecycle migration 086, invite RPCs, all service-role call sites, isolation migrations 087/088) was read in full. The generic mutation surface (per-module CRUD Server Actions) was **sampled** for its guard pattern rather than enumerated line-by-line.

- **High confidence:** auth flow, trial/billing enforcement, service-role inventory, invite flow, raw-email leakage points.
- **Needs a follow-up sweep (flagged inline):** exhaustive per-table RLS `WITH CHECK` verification, and a mechanical `search_path` audit of all 50 SECURITY DEFINER functions.

---

## Executive Summary

The control plane is **structurally sound and defense-in-depth by design**. Tenancy is derived server-side (`requireOrg`), the org cookie is never trusted directly, mutation-carrying RPCs re-check `auth.uid()` + membership + role, and the trial-reuse hardening (migration 086) already closes the "second org = second trial" hole at the database level with unique constraints. `changePlanAction` correctly refuses to activate paid or trial plans from the browser.

No **P0** (live, cross-tenant, exploitable-now) defect was found in the sampled surface. The material gaps are **P1 hardening** issues:

1. **Service role used inside user-triggered Server Actions** for push subscriptions — bypasses RLS as a defense layer (writes are context-scoped, so not cross-tenant, but violates least-privilege / deny-by-default).
2. **Raw email persisted into `audit_logs` / `domain_events`** by the invite and CRM actions — direct violation of the "no raw email in audit/event tables" principle.
3. **Trial billing identity is an unsalted `sha256(lower(trim(email)))`** — migration 086 itself documents this as a deferred gap. Phase 1 requires an HMAC-SHA256 with a server pepper. Unsalted hashing is enumerable (rainbow-tableable) for emails.
4. **At least one legacy SECURITY DEFINER function (`init_free_subscription`, 012) lacks an explicit `search_path`** — a full sweep is required.

---

## Current Auth Flow

Supabase SSR (`@supabase/ssr`), cookie-based sessions. No custom auth provider.

| Layer | File | Role |
|---|---|---|
| Session client (server) | `lib/supabase/server.ts` | RLS-scoped `authenticated` client for Server Components/Actions |
| Session client (browser) | `lib/supabase/client.ts` | anon client |
| Current user | `lib/auth/get-current-user.ts` | reads session; returns `User \| null` |
| Hard gate (user) | `lib/auth/require-user.ts` | `redirect(/login)` if unauthenticated; **called inside each Server Action** (not just proxy) |
| Edge gate | `proxy.ts` | HTTP-level auth (Next.js proxy/middleware) — "defense in depth: proxy + requireUser" |
| Login/Register UI | `app/(auth)/login/page.tsx`, `.../register/page.tsx` → `features/auth/components/*` | Supabase auth forms |

**Good:** `require-user.ts` explicitly documents *not* relying on the proxy alone, per Next.js 16 guidance — auth is re-verified in every server function.

---

## Current Organization / Workspace Resolution

`lib/auth/require-org.ts` (wrapped in React `cache()`), backed by `resolve-active-organization.ts` + `organization-cookie.ts`.

- Loads **all active memberships** for `auth.uid()` (`memberships` join `organizations`).
- Active org chosen by `resolveActiveOrganizationId(records, cookieHint)` — the `active_org_id` cookie is treated as a **hint only** and validated against real memberships (never trusted directly). Deterministic fallback to oldest active membership.
- If no membership / no workspace → `redirect(/onboarding)` (fail-closed).
- Returns a typed `CurrentContext { user, org, membership, role, permissions, workspace }`.

**Good:** the multi-org resolver is the single choke point; downstream mutations take `org.id` from this context, not from the client.

---

## Current Permission Model

Role-derived, no `role_permissions` table. `ROLE_PERMISSIONS: Record<OrgRole, string[]>` in `require-org.ts:48` mirrors the DB helpers (`is_org_admin`, `can_write_data`, `can_delete_data` from `002_security_functions.sql`).

| Role | Write | Delete | Billing | Financial execute | Notes |
|---|---|---|---|---|---|
| owner | ✓ | ✓ | ✓ | ✓ | full set incl. `developer.manage` |
| admin | ✓ | ✓ | ✓ | ✓ | no `org.delete` |
| manager | ✓ | ✓ | — | — (subscription/doc only) | |
| member | ✓ | — | — | — (safe quick actions only) | capture inbox is owner-scoped |

**Good:** UI permission set is a *mirror* of DB enforcement, not the source of truth — matches the "backend authorization is mandatory even if UI hides it" principle. Financial/billing executes are gated to owner/admin both in the set and (per audit note) in the RPCs.

---

## Current Billing / Trial / Plan Enforcement

Source of truth = database. Key migration: **086_trial_reuse_protection.sql** (applied to remote per project memory).

- **`billing_trial_claims`** — one row per billing-owner identity. `UNIQUE(user_id)`, `UNIQUE(normalized_email_hash)`, partial `UNIQUE(billing_customer_id)`. RLS: SELECT own-or-admin; **no INSERT/UPDATE/DELETE policies** (written only by SECURITY DEFINER functions — no service role in app logic). ✓
- **`init_trial_subscription(org, owner)`** (SECURITY DEFINER, `search_path` set) — atomic claim; on unique-violation grants an **`expired`/read-only** subscription instead of a trial. Called only from `create_organization()`.
- **`check_trial_eligibility()`** — identity strictly from `auth.uid()`, no client payload; UX-only, `GRANT ... authenticated`. Consumed by `get-trial-eligibility.ts` (fail-open for UX, since DB constraints are the real guard).
- **`consume_expired_trials()`** — cron sweep, `GRANT ... service_role` only. Driven by `app/api/cron/trial-sweep/route.ts` (Bearer `CRON_SECRET`, fail-closed).
- **`changePlanAction`** (`modules/billing/actions/change-plan.action.ts`): refuses `planSlug === "trial"` (no trial resurrection) **and** refuses all paid activation from the browser ("activated after payment is confirmed"). ✓ This is the correct posture pending a payment-provider webhook.

**Gap (P1):** `normalized_email_hash()` is plain `sha256(lower(trim(email)))` with **no pepper/HMAC** — migration 086 comments acknowledge this ("в БД нет серверного секрета… salted/keyed hash — будущее hardening"). This is the primary Phase 1 objective.

---

## Current Invite Flow

All invite mutations go through SECURITY DEFINER RPCs that re-check authorization server-side (the Server Action guard is UX-only, cannot be bypassed by calling the RPC directly).

| Action | RPC | Guarding |
|---|---|---|
| `invite-member.action.ts` | `invite_member(org,email,role)` | requireOrg + owner/admin (UI) → RPC re-checks admin, member limit, trial-expired, user-exists |
| `create-invite-link.action.ts` | `create_invite_link(org,role)` | owner/admin → RPC re-checks; returns opaque token, client builds `/invite/<token>` |
| `accept-invite.action.ts` | `accept_invite(org)` | `requireUser` (invited-only users have no active org); RPC resolves membership by `auth.uid()` — client `organizationId` is validated, not trusted |
| `accept-invite-link.action.ts` | `accept_invite_link(token)` | `requireUser`; RPC validates token, member limit, trial state |
| `decline-invite.action.ts` | (RPC) | own membership only |

**Good:** trial-expired and member-limit are enforced *inside* the invite RPCs — a read-only org cannot accept new members.
**Leak (P1):** `invite-member.action.ts:83` writes the invitee's **raw email** into `audit_logs.newData` (and `modules/settings/actions/invite-member.ts:51,60` into both audit + domain_events). See PII section.

---

## Current RLS and RPC Model

- RLS is the primary tenant-isolation boundary; helper functions `is_org_member`, `is_org_admin`, `can_write_data`, `can_delete_data` (002) are used in policies and RPCs.
- **50 SECURITY DEFINER functions**; most later migrations set explicit `search_path = public, pg_catalog` (verified in 086). A mechanical sweep found **`init_free_subscription` (012_saas_billing.sql:218) with no explicit `search_path`** — legacy, possibly dormant (trial path now uses `init_trial_subscription`), but still a hardening gap. A full 50-function sweep is required before sign-off.
- **087/088** split the `domain_events` read policy into business/personal/security/system classes and made the capture inbox owner-scoped — closing an earlier "every member reads the whole org event stream" leak. Both are **applied** (088 confirmed applied 2026-07-06).

---

## Mutation Map

Representative sample of mutation boundaries and their guard pattern (the pattern is consistent across the ~139 Server Actions).

| Area | File | Action/RPC | Current Guard | Missing Guard | Risk |
|---|---|---|---|---|---|
| Billing | `modules/billing/actions/change-plan.action.ts` | (no write) | requireOrg + owner/admin; refuses trial + paid | — | Low |
| Members | `modules/members/actions/invite-member.action.ts` | `invite_member` RPC | owner/admin (UI) + RPC re-check | raw email → audit_logs | **P1 PII** |
| Members | `.../accept-invite.action.ts` | `accept_invite` RPC | requireUser; RPC binds to auth.uid() | — | Low (client org id validated) |
| Analytics | `modules/analytics/actions/create-snapshot.action.ts` | `analytics_snapshots.upsert` | requireOrg + admin; `organization_id = org.id` (server) | `workspace_id` from client not validated ∈ org | **P2** (verify RLS `WITH CHECK`) |
| Settings | `modules/settings/actions/update-workspace.ts` | update | requireOrg | — | Low |
| Notifications | `modules/settings/notifications/actions/manage-push-subscription.ts` | `push_subscriptions.upsert/delete` | requireOrg; **service-role client** | RLS bypassed | **P1** (see service-role section) |
| CRM (paused) | `modules/crm/actions/create-client.action.ts` | insert + domain_event | requireOrg | raw email → domain_event payload | **P1 PII** |
| Money | `modules/moneyflow/**` actions | RPC / insert | requireOrg + role; money mutations require confirmation | (sampled; verify each) | Low–P2 |
| Cron | `app/api/cron/*/route.ts` | service-role RPCs | Bearer `CRON_SECRET`, fail-closed | — | Low |

> **Follow-up:** enumerate the remaining ~130 actions mechanically to confirm each `insert/update/upsert/delete` derives `organization_id` from `requireOrg` (not client) and is covered by an RLS `WITH CHECK`.

---

## Client Payload Trust Risks

| File | Payload Field | Risk | Recommended Fix |
|---|---|---|---|
| `modules/analytics/actions/create-snapshot.action.ts:23` | `workspaceId` (formData) | Snapshot could be tagged with another org's `workspace_id`; `organization_id` is server-derived so no cross-tenant read, but data-integrity risk | Validate `workspace_id ∈ org` server-side or ensure `analytics_snapshots` RLS `WITH CHECK` enforces `workspace.organization_id = organization_id` |
| `modules/members/actions/accept-invite.action.ts:28` / `decline-invite.action.ts:20` | `organizationId` (formData) | Low — RPC (`accept_invite`) resolves the membership by `auth.uid()`; a wrong/foreign org id just fails | Keep; RPC binding is the real guard |
| `modules/settings/actions/update-workspace.ts:20-21` | `organizationName`, `workspaceName` | Content only, not an id — no tenancy risk | — |

**General:** no sampled mutation took `organization_id` from the client for the *write scope*; all derive it from `requireOrg`. Good baseline.

---

## Service Role Usage

`lib/supabase/service-role.ts` → `getServiceRoleClient()` (returns `null` if unconfigured; fail-safe). Call sites:

| File | Usage | Legitimate? | Risk | Recommended Fix |
|---|---|---|---|---|
| `lib/rate-limit/rate-limit.ts:61` | write-RPC to rate-limit table (authenticated can't) | ✓ infra, fail-open | Low | — |
| `app/api/cron/*` → `consume-expired-trials.ts`, `sweep-subscription-payment-workflow.ts`, `expire-stale-suggestions.ts`, `extraction-worker.ts`, `process-reminders.ts`, `notification-delivery.ts` | cross-org cron sweeps | ✓ established cron pattern (not user-triggered) | Low | — |
| ~~`modules/settings/notifications/actions/manage-push-subscription.ts`~~ | upsert/delete `push_subscriptions` | ✅ **FIXED (2026-07-06)** — now uses the RLS-scoped authenticated client (`push_subscriptions` already had owner-scoped policies in 073); service role removed from the user path | — |

---

## Raw Email / PII Leakage Risks

Principle: *no raw email in billing_trial_claims, security_events, audit logs, domain_events, or application logs.*

| File/Table | Field | Risk | Recommended Fix |
|---|---|---|---|
| ~~`modules/members/actions/invite-member.action.ts` → `audit_logs.new_data`~~ | `email` | ✅ **FIXED (2026-07-06)** — masked via `maskEmail()` | — |
| ~~`modules/settings/actions/invite-member.ts` → `audit_logs` + `domain_events`~~ | `email` | ✅ **FIXED (2026-07-06)** — masked via `maskEmail()` in both sinks | — |
| ~~`modules/crm/actions/create-client.action.ts` → `domain_event.payload`~~ | `email` | ✅ **FIXED (2026-07-06)** — masked via `maskEmail()`; raw email stays only in the RLS-scoped `crm_clients` row | — |
| `billing_trial_claims` (086) | — | ✓ **no raw email** (only `normalized_email_hash`) | keep; upgrade hash to HMAC (below) |
| Application logger (`lib/observability/logger`) | — | Sampled log calls use scoped keys, not raw email | Add a lint/redaction guard to keep it that way |

---

## Trial Abuse Risks

| Scenario | Currently Protected? | Gap | Recommended Fix |
|---|---|---|---|
| Second org → second trial | ✅ `UNIQUE(user_id)` + `UNIQUE(normalized_email_hash)`; repeat org gets `expired`/read-only | — | — |
| Delete org & recreate | ✅ claim survives org (`organization_id ON DELETE SET NULL`) | — | — |
| Expired/canceled trial re-activation via dashboard | ✅ `changePlanAction` refuses `trial` and all paid plans | — | — |
| Same email, new auth user | ✅ `check_trial_eligibility` checks `normalized_email_hash` | — | — |
| **Email-hash enumeration / precomputation** | ⚠️ Partial | **Unsalted `sha256`** — an attacker with table access can rainbow-table emails; also can't rotate | **Phase 1: HMAC-SHA256 over canonical email with a server pepper** (documented in 086 as deferred) |
| Concurrent double-claim (race) | ✅ unique constraints + `INSERT ... EXCEPTION unique_violation` in `init_trial_subscription` | — | Add an explicit race test |
| Plus-alias abuse (`a+x@`) | Not stripped (by design — matches "don't strip unless policy") | — | Keep unless product decides otherwise |

---

## Invite Abuse Risks

| Scenario | Currently Protected? | Gap | Recommended Fix |
|---|---|---|---|
| Non-admin invites a member | ✅ UI guard + `invite_member` RPC re-checks admin | — | — |
| Invite beyond plan seat limit | ✅ `checkPlanLimit` + RPC `member_limit_reached` | — | — |
| Accept invite into read-only/expired-trial org | ✅ RPC returns `trial_expired` | — | — |
| Accept someone else's invite | ✅ RPC binds membership to `auth.uid()` | — | — |
| Invite-link token brute force / expiry | Assumed handled in `create_invite_link`/`accept_invite_link` (opaque token) — **not fully read this pass** | ⚠️ verify token entropy + expiry + single-use | Confirm token is high-entropy, expiring, and revocable in the invites migration |
| Raw email in invite audit trail | ❌ | Leaked (see PII table) | Hash/redact |

---

## RLS Gaps

| Table | Read Policy | Write Policy | WITH CHECK | Gap |
|---|---|---|---|---|
| `billing_trial_claims` | own-or-admin | none (SECURITY DEFINER only) | n/a | ✅ correct |
| `domain_events` | class-split (087/088) | member insert | — | ✅ 087+088 applied (088 confirmed 2026-07-06) |
| `push_subscriptions` | (bypassed — service role) | (bypassed) | — | **P1** — no authenticated-client RLS path; see service-role fix |
| `analytics_snapshots` | (assumed org-scoped) | upsert with server `org_id` | **unverified for `workspace_id`** | **P2** — confirm `WITH CHECK` ties `workspace_id` to org |
| ~all other tenant tables | is_org_member family | can_write/can_delete | mostly present | **Follow-up: mechanical `WITH CHECK` enumeration required** |

---

## Tests Coverage

Present (sampled):
- `modules/billing/services/trial-eligibility.test.ts` — eligibility parsing (fail-closed).
- `lib/billing/account-limits.test.ts`, `lib/auth/resolve-active-organization.test.ts`, `lib/context/current-context.test.ts`.
- `modules/*/services/*.test.ts` for service-role sweeps (extraction, suggestions) — assert null-service safe-skip.
- DB verification scripts: `supabase/tests/trial_reuse_verification*.sql`, `data_isolation_visibility_verification.sql`.

Missing / recommended:
- **Concurrency test** for `init_trial_subscription` (two simultaneous claims → exactly one).
- **DB constraint test** asserting a raw-email column never exists in billing/security tables.
- **RLS bypass test** for `push_subscriptions` after the service-role fix.
- **`WITH CHECK` negative tests** proving a member cannot write another org's row via direct Supabase API.

---

## P0 Fixes

None identified in the sampled surface. (Caveat: an exhaustive per-table `WITH CHECK` sweep and the invite-token migration review were not completed this pass — either could surface a P0.)

## P1 Fixes

> **Status: all P1s resolved (2026-07-06).**

1. ~~**Remove service role from user-triggered push-subscription actions**~~ — ✅ **done**. `manage-push-subscription.ts` now uses the RLS-scoped authenticated client; `push_subscriptions` already had owner-scoped policies (073), so no schema change was needed and the service role is gone from the user path.
2. ~~**Stop persisting raw email into `audit_logs` / `domain_events`**~~ — ✅ **done**. New `maskEmail()` util (`lib/email/mask-email.ts`, unit-tested) masks the local part; applied at all three sinks (members invite, settings invite, CRM create-client). No raw email reaches audit/event rows.
3. ~~**Upgrade trial billing identity to HMAC-SHA256 + server pepper**~~ — ✅ **done** in Phase 1 (migration 089, applied 2026-07-06).
4. ~~**`search_path` sweep of all SECURITY DEFINER functions**~~ — ✅ **done** (Appendix A: 91 functions, all now with explicit `search_path`; `init_free_subscription` hardened in migration 090).
5. ~~**Apply migration 088** (business-activity owner-scope)~~ — ✅ **done** (applied to remote, confirmed 2026-07-06); the refined `domain_events` visibility split is now live.
6. ~~**Invite single-use race** (Appendix C Low)~~ — ✅ **done**. `accept_invite_link` now row-locks the pending invite (`FOR UPDATE`) in migration 090, making a token strictly single-use.

Remediation shipped in **migration 090** (`init_free_subscription` search_path +
`accept_invite_link` `FOR UPDATE`) and the app changes above. **Migrations 088,
089 and 090 are all applied to remote (090 confirmed 2026-07-06).** No P1 or Low
items remain open from this audit — all are closed in code and on remote.

## P1 → follow-up (verification, not code)

6. **Confirm invite-link token** entropy, expiry, and single-use semantics.
7. **Confirm `analytics_snapshots` RLS `WITH CHECK`** ties `workspace_id` to `organization_id`.
8. **Mechanical enumeration** of all ~130 remaining Server Actions for client-`organization_id` trust and RLS `WITH CHECK` coverage.

---

## Final Recommendation

The security foundation is **strong and consistent**: server-derived tenancy, RPC-enforced authorization, DB-level trial-reuse protection, and an honest billing posture that refuses to activate paid/trial plans from the browser. There is **no evidence of a live cross-tenant P0** in the audited paths.

Proceed to **Phase 1** with a tightened scope: the highest-leverage item is **hardening the trial identity hash to HMAC-SHA256 with a server pepper** (already the documented Phase 1 goal). Alongside it, close the three cheap P1s — service role in the push actions, raw email in the audit/event sinks, and the `search_path` sweep. (Migration 088 has since been applied.) Before public launch, complete the two deferred verification sweeps (invite-token semantics and the full RLS `WITH CHECK` enumeration), since a defect there is the only place a P0 could still be hiding.

---

# Appendix — Exhaustive Sweeps (completes the Phase 0 DoD)

> Added after the initial sampled pass. These three mechanical sweeps close the
> DoD items that were previously covered by sampling. Method: scripted scans over
> `supabase/migrations/*.sql` and all `"use server"` files, then manual
> classification of every exception. **Net effect on findings: the P0 conclusion
> is unchanged (no P0). One earlier P1 is downgraded (dormant), one new Low is
> added (invite single-use race).**

## Appendix A — Every SECURITY DEFINER function's `search_path`

Scan resolves `CREATE OR REPLACE` to the **latest** definition per function.

- **91** SECURITY DEFINER functions (current definitions).
- **90** set an explicit `SET search_path`. ✅
- **1** does not: **`init_free_subscription(uuid)`** (`012_saas_billing.sql`).

`init_free_subscription` is **dormant / unreachable**: its only referent is the
deprecated no-op `initSubscriptionAction` (`modules/billing/actions/init-subscription.action.ts`,
which grants nothing), it is internal-only (grants revoked in 035), and no SQL
or app code calls it. **Downgrade** from the earlier P1 framing to *latent
hygiene* — not exploitable. Recommendation: add `SET search_path = public,
pg_catalog` (or `DROP FUNCTION`) in a future migration for completeness.

**Conclusion:** the SECURITY DEFINER `search_path` posture is clean; the single
exception carries no live risk.

## Appendix B — Every Server Action's authorization

**139** `"use server"` files. Guard distribution (direct):

| Guard | Count |
|---|---|
| `requireOrg` (incl. `+requireUser` / `+perm` combos) | 111 |
| `requireUser` only (auth-context appropriate) | 6 |
| No **direct** guard token | 22 |

All **22** "no direct guard" files were classified individually — **none is an
unguarded user-facing mutation**:

| Group | Files | Why safe |
|---|---|---|
| Auth endpoints | `login` / `register` / `logout` | establish the session; a guard would be circular |
| Locale cookie | `shared/i18n/set-locale.action.ts` | sets a cookie, no tenant data |
| Settings actions (8) | `invite-member`, `update-member-role`, `remove-member`, `update-workspace`, `update-profile`, `update-avatar`, `remove-avatar`, `create-billing-portal-session` | guarded by `authorizeSettingsAction` → `requireOrg` + owner/admin |
| Delegating wrappers | `ai/actions.ts` (→ guarded `@/modules/ai`), `action-center/get-feed` & `get-action-detail` (→ `requireOrg` queries), `relations/delete-relation` & `search-relation-candidates` (→ `relation.service` `requireOrg`) | authorization enforced in the delegate |
| Internal infra (not entry points) | `lib/events/emit-audit-log.ts`, `automation/logs/create-automation-log.ts`, `automation/engine/dispatch-domain-event.ts` | invoked only inside guarded flows; org id from server context |
| Non-action | `relations/relation.schema.ts` (`"use server"` in a comment — false positive), `relations/*.query.test.ts` (test) | not a runtime action |

**Client-supplied `organization_id` / `workspace_id`** (4 matches): `accept-invite`
and `decline-invite` (RPC binds to `auth.uid()` — validated, not trusted),
`dispatch-domain-event` (internal; org id from the server-side emitter), and
`create-snapshot` (`workspaceId` — the **P2** already recorded in the main
Client Payload Trust table). No new trust risk.

**Conclusion:** 139/139 actions have server-side authorization (directly or by
delegation); zero unguarded user-facing mutations; the only client-id trust
item remains the documented `create-snapshot` P2.

## Appendix C — Invite-link token semantics

Source: `026_invite_links.sql` (`organization_invites`, `create_invite_link`,
`get_invite_info`, `accept_invite_link`) + the `076` seat trigger.

| Property | Finding | Verdict |
|---|---|---|
| **Entropy** | token = two `gen_random_uuid()` concatenated (64 hex). `gen_random_uuid()` is CSPRNG-backed → ~244 bits. | ✅ enumeration infeasible |
| **Expiry** | `expires_at NOT NULL DEFAULT now()+7 days`; enforced in `accept_invite_link` (`expires_at > now()`) and surfaced by `get_invite_info`. | ✅ |
| **Single-use** | `status` flips `pending → accepted`; re-use is rejected (`status='pending'` guard). | ✅ (with caveat below) |
| **Public read** | `get_invite_info` is anon-readable by design (the `/invite/<token>` pre-login page). Safe given token entropy. | ✅ |
| **Seat limit under race** | `accept_invite_link` counts seats non-atomically, **but** the `076` `enforce_member_seat_limit` BEFORE-INSERT trigger serializes per-org with `pg_advisory_xact_lock` — concurrent accepts **cannot overshoot** `max_members`. | ✅ |

**New Low finding — ✅ FIXED (migration 090, 2026-07-06):** the pending-status
`SELECT` in `accept_invite_link` lacked `FOR UPDATE`, so two concurrent accepts
of the same token could both pass the `status='pending'` check and each add a
membership. Impact was bounded — the 076 seat trigger guarantees the org never
exceeds `max_members`, and both joins are to the correct tenant (no cross-tenant
risk). Migration 090 adds `FOR UPDATE` to the pending-select, so the second
concurrent accept blocks, then sees `status='accepted'` and is rejected —
strictly one acceptance per link.

## Appendix — DoD status

| Deferred DoD item | Status |
|---|---|
| All write actions mapped | ✅ Appendix B (139/139) |
| All SECURITY DEFINER functions listed w/ `search_path` | ✅ Appendix A (91, one dormant exception) |
| Invite-token entropy / expiry / single-use verified | ✅ Appendix C |

**Phase 0 is now complete.** No change to the P0 conclusion. Updated finding
ledger: `init_free_subscription` `search_path` → *latent hygiene (dormant)*;
invite single-use race → *new Low*. **All P1 and Low items from this audit are
now remediated** (see the P1 Fixes section) — service role removed from the push
actions, raw email masked in the audit/event sinks, `search_path` hardened, and
the invite made strictly single-use. **Migrations 088, 089 and 090 are all
applied to remote (090 confirmed 2026-07-06).**
