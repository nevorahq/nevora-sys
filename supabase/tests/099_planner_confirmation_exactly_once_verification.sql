-- Planner confirmation exactly-once (migration 099) verification harness.
--
-- Run only against local/test/staging databases: the script creates disposable
-- rows inside a transaction and rolls them back.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/099_planner_confirmation_exactly_once_verification.sql
--
-- What this proves, and why it is worth proving in SQL rather than only in the
-- service tests: the unit tests mock the database, so they can only show that
-- acceptPlannerSuggestion *reacts correctly* to a 23505. They cannot show that
-- Postgres actually raises one. If the index is missing or its predicate is wrong,
-- every mocked test still passes while production quietly creates duplicate tasks.
-- These assertions talk to the real indexes.

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(ok, false) THEN
    RAISE EXCEPTION 'Exactly-once verification failed: %', message;
  END IF;
END;
$$;

-- Did `stmt` violate a unique constraint?
CREATE OR REPLACE FUNCTION pg_temp.raises_unique_violation(stmt text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE stmt;
  RETURN false;
EXCEPTION
  WHEN unique_violation THEN
    RETURN true;
END;
$$;

CREATE TEMP TABLE ids (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
INSERT INTO ids VALUES
  ('org',  gen_random_uuid()),
  ('sug',  gen_random_uuid()),
  ('sug2', gen_random_uuid());

INSERT INTO public.organizations (id, name, slug)
SELECT id, 'Exactly Once 099', 'exactly-once-099' FROM ids WHERE key = 'org';

-- ---------------------------------------------------------------------------
-- 1. The four indexes the invariant rests on exist.
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_true(to_regclass('public.todos_source_suggestion_unique_idx') IS NOT NULL,
  'todos_source_suggestion_unique_idx is missing — create_task confirms can duplicate');
SELECT pg_temp.assert_true(to_regclass('public.todos_financial_source_unique_idx') IS NOT NULL,
  'todos_financial_source_unique_idx is missing — createFinancialTask''s 23505 branch is dead code');
SELECT pg_temp.assert_true(to_regclass('public.action_items_dedupe_idx') IS NOT NULL,
  'action_items_dedupe_idx is missing');
SELECT pg_temp.assert_true(to_regclass('public.entity_links_unique_active_idx') IS NOT NULL,
  'entity_links_unique_active_idx is missing');

-- ---------------------------------------------------------------------------
-- 2. A second standard task from the SAME suggestion is rejected by the database.
--    This is the crash-retry path: the reconciler released the claim, the retry
--    re-ran routeAccept, and only the index stands between the user and a
--    duplicate task.
-- ---------------------------------------------------------------------------
INSERT INTO public.todos (organization_id, title, source_suggestion_id)
SELECT (SELECT id FROM ids WHERE key = 'org'), 'Confirmed once', (SELECT id FROM ids WHERE key = 'sug');

SELECT pg_temp.assert_true(
  pg_temp.raises_unique_violation(format(
    $fmt$INSERT INTO public.todos (organization_id, title, source_suggestion_id)
         VALUES (%L, 'Confirmed twice', %L)$fmt$,
    (SELECT id FROM ids WHERE key = 'org'),
    (SELECT id FROM ids WHERE key = 'sug'))),
  'a retried confirm created a SECOND task for the same suggestion'
);

-- A *different* suggestion is unaffected.
SELECT pg_temp.assert_true(
  NOT pg_temp.raises_unique_violation(format(
    $fmt$INSERT INTO public.todos (organization_id, title, source_suggestion_id)
         VALUES (%L, 'Different draft', %L)$fmt$,
    (SELECT id FROM ids WHERE key = 'org'),
    (SELECT id FROM ids WHERE key = 'sug2'))),
  'the index is over-broad: a different suggestion could not create its own task'
);

-- Hand-created tasks carry no suggestion and must never collide with each other.
SELECT pg_temp.assert_true(
  NOT pg_temp.raises_unique_violation(format(
    $fmt$INSERT INTO public.todos (organization_id, title, source_suggestion_id)
         VALUES (%L, 'Manual A', NULL), (%L, 'Manual B', NULL)$fmt$,
    (SELECT id FROM ids WHERE key = 'org'),
    (SELECT id FROM ids WHERE key = 'org'))),
  'NULL source_suggestion_id must not participate in the unique key'
);

-- ---------------------------------------------------------------------------
-- 3. A soft-deleted task frees the key.
--    Otherwise deleting a task confirmed from a draft would permanently block the
--    user from ever confirming that draft again.
-- ---------------------------------------------------------------------------
UPDATE public.todos
   SET deleted_at = now()
 WHERE source_suggestion_id = (SELECT id FROM ids WHERE key = 'sug');

SELECT pg_temp.assert_true(
  NOT pg_temp.raises_unique_violation(format(
    $fmt$INSERT INTO public.todos (organization_id, title, source_suggestion_id)
         VALUES (%L, 'Reconfirmed after delete', %L)$fmt$,
    (SELECT id FROM ids WHERE key = 'org'),
    (SELECT id FROM ids WHERE key = 'sug'))),
  'a soft-deleted task still occupies the key — the draft can never be reconfirmed'
);

-- ---------------------------------------------------------------------------
-- 4. The same for financial tasks: (org, financial_source_type, financial_source_id).
--    createFinancialTask catches 23505 and re-reads the winner; before 099 no index
--    existed to raise it, so that recovery branch was unreachable and two confirms
--    both inserted.
-- ---------------------------------------------------------------------------
INSERT INTO public.todos (organization_id, title, financial_source_type, financial_source_id)
SELECT (SELECT id FROM ids WHERE key = 'org'), 'Pay invoice', 'manual', (SELECT id FROM ids WHERE key = 'sug');

SELECT pg_temp.assert_true(
  pg_temp.raises_unique_violation(format(
    $fmt$INSERT INTO public.todos (organization_id, title, financial_source_type, financial_source_id)
         VALUES (%L, 'Pay invoice twice', 'manual', %L)$fmt$,
    (SELECT id FROM ids WHERE key = 'org'),
    (SELECT id FROM ids WHERE key = 'sug'))),
  'a retried confirm created a SECOND financial task for the same source'
);

-- ---------------------------------------------------------------------------
-- 5. Cross-organization: the key is scoped per org, so two orgs may each confirm
--    a suggestion that happens to share an id. (Defensive: ids are UUIDs, but the
--    index must not be the thing that enforces tenancy.)
-- ---------------------------------------------------------------------------
INSERT INTO ids VALUES ('org2', gen_random_uuid());
INSERT INTO public.organizations (id, name, slug)
SELECT id, 'Exactly Once 099 B', 'exactly-once-099-b' FROM ids WHERE key = 'org2';

SELECT pg_temp.assert_true(
  NOT pg_temp.raises_unique_violation(format(
    $fmt$INSERT INTO public.todos (organization_id, title, source_suggestion_id)
         VALUES (%L, 'Other org, same suggestion id', %L)$fmt$,
    (SELECT id FROM ids WHERE key = 'org2'),
    (SELECT id FROM ids WHERE key = 'sug2'))),
  'the unique key is not org-scoped'
);

DO $$ BEGIN RAISE NOTICE '099 planner confirmation exactly-once: all assertions passed'; END $$;

ROLLBACK;
