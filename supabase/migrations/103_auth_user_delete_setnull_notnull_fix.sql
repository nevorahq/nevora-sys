-- =============================================================================
-- Migration 103: Fix self-contradictory "NOT NULL + ON DELETE SET NULL" FKs
--                that still block auth.users deletion
--
-- Follow-up to migration 102. Deleting a user surfaced a second, subtler class
-- of blocker (SQLSTATE 23502):
--
--   null value in column "changed_by" of relation "task_due_date_changes"
--   violates not-null constraint
--
-- Several columns are declared BOTH `NOT NULL` AND `... REFERENCES auth.users(id)
-- ON DELETE SET NULL`. That is self-contradictory: when the referenced user is
-- deleted the FK action tries to write NULL into a NOT NULL column, which fails
-- and rolls the whole DELETE back. Migration 102's RESTRICT/NO ACTION scan did
-- not catch these because their ON DELETE action already reads as SET NULL.
--
-- Known offenders (all audit / history / event tables, where SET NULL is the
-- CORRECT intent — preserve the record, forget the actor):
--
--   document_comments.user_id
--   task_due_date_changes.changed_by
--   domain_events.created_by
--   audit_logs.user_id
--   task_comments.user_id
--
-- Fix: keep the FK as SET NULL (intent is right) and simply DROP the NOT NULL
-- on the referencing column so the SET NULL can actually happen. The audit row
-- survives with a NULL actor.
--
-- Implemented data-driven rather than hand-listed: drop NOT NULL from EVERY
-- column that is (a) the single referencing column of an FK to auth.users whose
-- ON DELETE action is SET NULL, and (b) currently NOT NULL. This covers the five
-- known columns, anything the migration history added via ALTER, and any future
-- table that reintroduces the same contradiction. It deliberately does NOT touch
-- CASCADE columns (e.g. planner_entries.created_by) or SET-NULL columns that are
-- already nullable. Idempotent / re-runnable.
-- =============================================================================

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum   = c.conkey[1]
    WHERE c.contype   = 'f'
      AND c.confrelid = 'auth.users'::regclass
      AND c.confdeltype = 'n'                 -- ON DELETE SET NULL
      AND array_length(c.conkey, 1) = 1       -- single-column FK
      AND a.attnotnull                         -- column is currently NOT NULL
  LOOP
    RAISE NOTICE 'Dropping NOT NULL on %.% (SET NULL FK to auth.users)', r.tbl, r.col;
    EXECUTE format('ALTER TABLE %s ALTER COLUMN %I DROP NOT NULL', r.tbl::text, r.col);
  END LOOP;
END;
$$;
