-- Learned project rules verification (migration 125, ADR 002 0.2b follow-up).
-- Run after the migrations; all fixtures are rolled back.
--
-- Proves: a project rule is private to its owner (read and write); it can only
-- point at a project of the same organization; one rule per user and source;
-- deleting the project deletes its rules; and channel_signals only holds a
-- small JSON object.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF NOT COALESCE(ok, false) THEN RAISE EXCEPTION 'Project rules verification failed: %', message; END IF; END $$;

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', p_user::text, true); END $$;

CREATE OR REPLACE FUNCTION pg_temp.raises(p_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$ BEGIN EXECUTE p_sql; RETURN false; EXCEPTION WHEN OTHERS THEN RETURN true; END $$;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rules-a@example.test', 'x', now(), now(), now()),
  ('f1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rules-b@example.test', 'x', now(), now(), now());

INSERT INTO public.organizations (id, name, slug, plan) VALUES
  ('f2000000-0000-4000-8000-000000000001', 'Rules Org', 'rules-org', 'free'),
  ('f2000000-0000-4000-8000-000000000002', 'Other Org', 'rules-other-org', 'free');

INSERT INTO public.memberships (user_id, organization_id, role, status) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'member', 'active'),
  ('f1000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 'member', 'active'),
  ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002', 'member', 'active');

INSERT INTO public.workspaces (id, organization_id, name, type, is_default) VALUES
  ('f3000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'Default', 'default', true),
  ('f3000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002', 'Default', 'default', true);

INSERT INTO public.projects (id, organization_id, workspace_id, name, slug) VALUES
  ('f4000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'Acme', 'acme'),
  ('f4000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'Internal', 'internal'),
  ('f4000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000002', 'Foreign', 'foreign');

-- channel_signals: an object, and small.
SELECT pg_temp.assert_true(
  pg_temp.raises($$INSERT INTO public.planner_entries (organization_id, created_by, owner_user_id, raw_text, entry_type, source, status, channel_signals)
    VALUES ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'x', 'text', 'manual', 'captured', '[]'::jsonb)$$),
  'channel_signals must be a JSON object'
);
SELECT pg_temp.assert_true(
  pg_temp.raises(format($f$INSERT INTO public.planner_entries (organization_id, created_by, owner_user_id, raw_text, entry_type, source, status, channel_signals)
    VALUES ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'x', 'text', 'manual', 'captured', %L::jsonb)$f$,
    jsonb_build_object('email_sender', repeat('a', 5000))::text)),
  'channel_signals must stay small'
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('f1000000-0000-4000-8000-000000000001');

-- Own rule into an own-org project: allowed.
INSERT INTO public.capture_project_rules (id, organization_id, owner_user_id, signal_type, signal_value, signal_label, project_id)
VALUES ('f5000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
        'slack_channel', 'T1:C1', '#acme', 'f4000000-0000-4000-8000-000000000001');

SELECT pg_temp.assert_true(
  pg_temp.raises($$INSERT INTO public.capture_project_rules (organization_id, owner_user_id, signal_type, signal_value, project_id)
    VALUES ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 'email_domain', 'acme.com', 'f4000000-0000-4000-8000-000000000001')$$),
  'a user must not create a rule for another member'
);
SELECT pg_temp.assert_true(
  pg_temp.raises($$INSERT INTO public.capture_project_rules (organization_id, owner_user_id, signal_type, signal_value, project_id)
    VALUES ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'email_domain', 'acme.com', 'f4000000-0000-4000-8000-000000000003')$$),
  'a rule must not point at another organization''s project'
);
SELECT pg_temp.assert_true(
  pg_temp.raises($$INSERT INTO public.capture_project_rules (organization_id, owner_user_id, signal_type, signal_value, project_id)
    VALUES ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'slack_channel', 'T1:C1', 'f4000000-0000-4000-8000-000000000002')$$),
  'one rule per user and source'
);
SELECT pg_temp.assert_true(
  pg_temp.raises($$INSERT INTO public.capture_project_rules (organization_id, owner_user_id, signal_type, signal_value, project_id)
    VALUES ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'keyword', 'acme', 'f4000000-0000-4000-8000-000000000001')$$),
  'only known signal types are stored'
);

-- A correction moves the rule to another own-org project; never across orgs.
UPDATE public.capture_project_rules SET project_id = 'f4000000-0000-4000-8000-000000000002'
  WHERE id = 'f5000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT project_id FROM public.capture_project_rules WHERE id = 'f5000000-0000-4000-8000-000000000001') = 'f4000000-0000-4000-8000-000000000002',
  'a user can retarget their own rule'
);
SELECT pg_temp.assert_true(
  pg_temp.raises($$UPDATE public.capture_project_rules SET project_id = 'f4000000-0000-4000-8000-000000000003'
    WHERE id = 'f5000000-0000-4000-8000-000000000001'$$),
  'a rule must not be retargeted to another organization''s project'
);

-- Private: another member neither sees nor changes it.
SELECT pg_temp.act_as('f1000000-0000-4000-8000-000000000002');
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM public.capture_project_rules WHERE id = 'f5000000-0000-4000-8000-000000000001'),
  'a user must not see another member''s rule'
);
DELETE FROM public.capture_project_rules WHERE id = 'f5000000-0000-4000-8000-000000000001';
UPDATE public.capture_project_rules SET hits = 99 WHERE id = 'f5000000-0000-4000-8000-000000000001';

SELECT pg_temp.act_as('f1000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true(
  (SELECT hits FROM public.capture_project_rules WHERE id = 'f5000000-0000-4000-8000-000000000001') = 0,
  'another member must not delete or change a rule'
);

-- The owner deletes their own rule.
DELETE FROM public.capture_project_rules WHERE id = 'f5000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM public.capture_project_rules WHERE id = 'f5000000-0000-4000-8000-000000000001'),
  'a user can delete their own rule'
);

RESET ROLE;

-- Deleting a project deletes the rules that point at it.
INSERT INTO public.capture_project_rules (id, organization_id, owner_user_id, signal_type, signal_value, project_id)
VALUES ('f5000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
        'email_domain', 'acme.com', 'f4000000-0000-4000-8000-000000000001');
DELETE FROM public.projects WHERE id = 'f4000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM public.capture_project_rules WHERE id = 'f5000000-0000-4000-8000-000000000002'),
  'deleting a project deletes its rules'
);

ROLLBACK;
