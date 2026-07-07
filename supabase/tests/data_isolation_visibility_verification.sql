-- Data Isolation & Activity Visibility — RLS verification (migration 087).
-- Run after `supabase db reset`; all fixtures are rolled back.
--
-- Covers the target model: business is org-wide, personal is owner-only,
-- security is owner/admin-only, system is never user-visible; and the capture
-- inbox (planner_entries) is a private per-owner surface.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF NOT COALESCE(ok, false) THEN RAISE EXCEPTION '%', message; END IF; END $$;

-- Switch the acting user (mirrors Supabase auth.uid() resolution).
CREATE OR REPLACE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
END $$;

-- ── Fixtures (inserted as superuser: RLS bypassed, BUT the classify trigger
--    still runs, so activity_type/visibility are set from event_name) ────────
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'iso-owner@example.test',  'x', now(), now(), now()),
  ('a0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'iso-admin@example.test',  'x', now(), now(), now()),
  ('a0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'iso-member1@example.test', 'x', now(), now(), now()),
  ('a0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'iso-member2@example.test', 'x', now(), now(), now());

INSERT INTO public.organizations (id, name, slug, plan) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'Iso Org', 'iso-org', 'free');

INSERT INTO public.memberships (user_id, organization_id, role, status) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'owner',  'active'),
  ('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'admin',  'active'),
  ('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'member', 'active'),
  ('a0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'member', 'active');

-- Domain events across all four classes.
INSERT INTO public.domain_events (id, organization_id, event_name, aggregate_type, aggregate_id, created_by) VALUES
  -- business authored by member1 → owner/admin + member1 (its author) see it
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'task.created', 'task', gen_random_uuid(), 'a0000000-0000-4000-8000-000000000003'),
  -- business authored by OWNER → owner/admin see it; a member must NOT (own-scope, migration 088)
  ('c0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000001', 'task.created', 'task', gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001'),
  -- personal to member1
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'planner_suggestion.created', 'planner_suggestion', gen_random_uuid(), 'a0000000-0000-4000-8000-000000000003'),
  -- personal to member2
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'planner_suggestion.created', 'planner_suggestion', gen_random_uuid(), 'a0000000-0000-4000-8000-000000000004'),
  -- security (role change by owner) → owner/admin only
  ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'member.role_changed', 'membership', gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001'),
  -- system (OCR job) → no user
  ('c0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 'document.extraction.started', 'document', gen_random_uuid(), 'a0000000-0000-4000-8000-000000000003');

-- Trigger classified them correctly?
SELECT pg_temp.assert_true((SELECT activity_type FROM public.domain_events WHERE id = 'c0000000-0000-4000-8000-000000000001') = 'business', 'task.created must classify as business');
SELECT pg_temp.assert_true((SELECT activity_type FROM public.domain_events WHERE id = 'c0000000-0000-4000-8000-000000000002') = 'personal', 'planner_suggestion.created must classify as personal');
SELECT pg_temp.assert_true((SELECT activity_type FROM public.domain_events WHERE id = 'c0000000-0000-4000-8000-000000000004') = 'security', 'member.role_changed must classify as security');
SELECT pg_temp.assert_true((SELECT activity_type FROM public.domain_events WHERE id = 'c0000000-0000-4000-8000-000000000005') = 'system', 'document.extraction.started must classify as system');

-- Private capture inbox rows (owner_user_id defaults to nothing here; set explicitly).
INSERT INTO public.planner_entries (id, organization_id, created_by, owner_user_id, raw_text, entry_type, source, status) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 'member1 private note', 'text', 'manual', 'captured'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004', 'member2 private note', 'text', 'manual', 'captured');

SET LOCAL ROLE authenticated;

-- ── Scenario: MEMBER1 ────────────────────────────────────────────────────────
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000003');
-- (1) sees OWN business activity
SELECT pg_temp.assert_true(EXISTS (SELECT 1 FROM public.domain_events WHERE id = 'c0000000-0000-4000-8000-000000000001'), 'member sees own business event');
-- member must NOT see another user's business activity (owner-scope, migration 088)
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.domain_events WHERE id = 'c0000000-0000-4000-8000-000000000006'), 'member must not see another user business event');
-- (4) sees OWN personal activity
SELECT pg_temp.assert_true(EXISTS (SELECT 1 FROM public.domain_events WHERE id = 'c0000000-0000-4000-8000-000000000002'), 'member sees own personal event');
-- (6) does NOT see another member personal activity
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.domain_events WHERE id = 'c0000000-0000-4000-8000-000000000003'), 'member must not see other member personal event');
-- (7) does NOT see security audit
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.domain_events WHERE id = 'c0000000-0000-4000-8000-000000000004'), 'member must not see security event');
-- (9) does NOT see system activity
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.domain_events WHERE id = 'c0000000-0000-4000-8000-000000000005'), 'member must not see system event');
-- own inbox visible, other member inbox blocked (10)
SELECT pg_temp.assert_true(EXISTS (SELECT 1 FROM public.planner_entries WHERE id = 'd0000000-0000-4000-8000-000000000001'), 'member sees own inbox capture');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.planner_entries WHERE id = 'd0000000-0000-4000-8000-000000000002'), 'member must not read another member private inbox');

-- ── Scenario: OWNER ──────────────────────────────────────────────────────────
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
-- (1) sees business activity of member
SELECT pg_temp.assert_true(EXISTS (SELECT 1 FROM public.domain_events WHERE id = 'c0000000-0000-4000-8000-000000000001'), 'owner sees business event of member');
-- (8) sees security audit
SELECT pg_temp.assert_true(EXISTS (SELECT 1 FROM public.domain_events WHERE id = 'c0000000-0000-4000-8000-000000000004'), 'owner sees security event');
-- (2) does NOT see member personal activity
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.domain_events WHERE id = 'c0000000-0000-4000-8000-000000000002'), 'owner must not see member personal event');
-- (9) does NOT see system activity
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.domain_events WHERE id = 'c0000000-0000-4000-8000-000000000005'), 'owner must not see system event');
-- (3) does NOT read member private inbox (personal AI capture)
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.planner_entries WHERE id = 'd0000000-0000-4000-8000-000000000001'), 'owner must not read member private inbox');

-- ── Scenario: ADMIN ──────────────────────────────────────────────────────────
SELECT pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
-- (8) admin sees security audit
SELECT pg_temp.assert_true(EXISTS (SELECT 1 FROM public.domain_events WHERE id = 'c0000000-0000-4000-8000-000000000004'), 'admin sees security event');
-- admin does NOT see member personal activity
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.domain_events WHERE id = 'c0000000-0000-4000-8000-000000000002'), 'admin must not see member personal event');

RESET ROLE;
ROLLBACK;
