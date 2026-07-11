-- =============================================================================
-- Migration 102: Make auth.users deletion safe (FK cascade/set-null cleanup)
--
-- Deleting a user in Supabase (Auth → Users) runs `DELETE FROM auth.users`.
-- Postgres rolls that back — surfaced as the generic
-- "Failed to delete user: Database error deleting user" — whenever any FK
-- referencing auth.users(id) uses ON DELETE RESTRICT or the default NO ACTION
-- and a referencing row exists.
--
-- Six such constraints existed in the schema. Diagnostics against the remote
-- (user enujnenco@enso.ro, 8145c922-31f4-49be-8dc3-edb79b36f34d) showed the
-- three that actually held rows and blocked deletion:
--
--   booking_requests.assigned_to_user_id   ON DELETE RESTRICT   (5 rows)
--   planner_entries.created_by             NO ACTION            (12 rows)
--   planner_suggestions.created_by         NO ACTION            (13 rows)
--
-- and three more that were empty at diagnosis time but carry the same latent
-- landmine for future users:
--
--   analytics_widgets.created_by           NO ACTION
--   analytics_reports.created_by           NO ACTION
--   ai_recommendations.dismissed_by        NO ACTION
--
-- Fix — semantics chosen per table, not blanket CASCADE:
--
--   * planner_entries / planner_suggestions: a user's Capture Inbox is their
--     own personal input layer (owner-scoped). When the user is deleted their
--     captures should go with them  → ON DELETE CASCADE. created_by stays
--     NOT NULL.
--
--   * booking_requests / analytics_widgets / analytics_reports: these are
--     org-level artifacts that must outlive the individual who created/was
--     assigned to them → make the column NULLABLE and ON DELETE SET NULL so
--     the historical record survives, only losing authorship/assignment.
--
--   * ai_recommendations.dismissed_by: already nullable, audit-style pointer
--     → ON DELETE SET NULL.
--
-- FKs are dropped dynamically by (table, column, referenced=auth.users) so we
-- do not depend on auto-generated constraint names, and the whole migration is
-- idempotent / re-runnable.
-- =============================================================================

-- Helper: drop whatever FK constraint sits on (schema.table).column and
-- references auth.users, if any. Safe to call when none exists.
CREATE OR REPLACE FUNCTION pg_temp._drop_authusers_fk(p_table regclass, p_column text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_conname text;
BEGIN
  SELECT c.conname
    INTO v_conname
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum   = c.conkey[1]
   WHERE c.conrelid = p_table
     AND c.contype  = 'f'
     AND c.confrelid = 'auth.users'::regclass
     AND array_length(c.conkey, 1) = 1
     AND a.attname  = p_column
   LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', p_table::text, v_conname);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. planner_entries.created_by  → ON DELETE CASCADE (stays NOT NULL)
-- ---------------------------------------------------------------------------
SELECT pg_temp._drop_authusers_fk('public.planner_entries', 'created_by');
ALTER TABLE public.planner_entries
  ADD CONSTRAINT planner_entries_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. planner_suggestions.created_by  → ON DELETE CASCADE (stays NOT NULL)
-- ---------------------------------------------------------------------------
SELECT pg_temp._drop_authusers_fk('public.planner_suggestions', 'created_by');
ALTER TABLE public.planner_suggestions
  ADD CONSTRAINT planner_suggestions_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. booking_requests.assigned_to_user_id  → NULLABLE + ON DELETE SET NULL
-- ---------------------------------------------------------------------------
SELECT pg_temp._drop_authusers_fk('public.booking_requests', 'assigned_to_user_id');
ALTER TABLE public.booking_requests
  ALTER COLUMN assigned_to_user_id DROP NOT NULL;
ALTER TABLE public.booking_requests
  ADD CONSTRAINT booking_requests_assigned_to_user_id_fkey
  FOREIGN KEY (assigned_to_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4. analytics_widgets.created_by  → NULLABLE + ON DELETE SET NULL
-- ---------------------------------------------------------------------------
SELECT pg_temp._drop_authusers_fk('public.analytics_widgets', 'created_by');
ALTER TABLE public.analytics_widgets
  ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.analytics_widgets
  ADD CONSTRAINT analytics_widgets_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 5. analytics_reports.created_by  → NULLABLE + ON DELETE SET NULL
-- ---------------------------------------------------------------------------
SELECT pg_temp._drop_authusers_fk('public.analytics_reports', 'created_by');
ALTER TABLE public.analytics_reports
  ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.analytics_reports
  ADD CONSTRAINT analytics_reports_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 6. ai_recommendations.dismissed_by  → ON DELETE SET NULL (already nullable)
-- ---------------------------------------------------------------------------
SELECT pg_temp._drop_authusers_fk('public.ai_recommendations', 'dismissed_by');
ALTER TABLE public.ai_recommendations
  ADD CONSTRAINT ai_recommendations_dismissed_by_fkey
  FOREIGN KEY (dismissed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
