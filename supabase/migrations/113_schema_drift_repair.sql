-- =============================================================================
-- 113 — repair the drift between supabase/migrations/ and the live database
-- =============================================================================
-- Found 2026-07-23 by running the opt-in integration test
-- (modules/documents/services/extraction-pipeline.integration.test.ts) against a
-- LOCAL database built from scratch: `supabase db reset` + this migration tree.
--
-- Two columns had drifted. On remote both were changed by hand at some point and
-- no migration followed, so the tree can no longer rebuild a working database:
--
--   1. public.workspaces.slug — MISSING here, PRESENT on remote.
--      create_organization() (049/086, SECURITY DEFINER) does
--        INSERT INTO public.workspaces (organization_id, name, slug, type, is_default)
--      so on a from-migrations database the very first user action — creating an
--      organization — fails with "column slug of relation workspaces does not exist".
--
--   2. public.money_accounts.user_id — NOT NULL here, ABSENT on remote.
--      000 created it NOT NULL; 004 moved the table to organization_id but never
--      dropped it. No application code sets user_id (see
--      modules/moneyflow/services/money-account-service.ts), so on a
--      from-migrations database every account insert fails the NOT NULL check —
--      including the default-account seed at onboarding.
--
-- On remote this migration is a NO-OP: the slug column already exists and the
-- user_id column is already gone. Its purpose is to make a rebuilt database
-- (staging, disaster recovery, a new environment, CI) behave like production.
--
-- Why this did not surface in CI: the `db` job applies every migration from
-- scratch, but then only runs SQL harnesses as role `postgres` — it never calls
-- create_organization() nor the application insert path. The companion harness
-- supabase/tests/113_schema_drift_repair_verification.sql closes that gap by
-- actually calling create_organization() inside a rolled-back transaction.
--
-- ROLLBACK LIMITATION: dropping workspaces.slug again would break
-- create_organization(); this migration is meant to be forward-only. It does not
-- drop money_accounts.user_id — see the note on that step below.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. workspaces.slug — the column create_organization() has always written.
-- ---------------------------------------------------------------------------
-- Deliberately NULLABLE and NOT unique: remote's exact definition was never
-- captured in a migration, and the writer (create_organization) always supplies
-- a value, so the loose definition cannot break the write path. Making it
-- NOT NULL here would instead risk failing on historical rows in an environment
-- whose workspaces predate the column.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS slug TEXT;

COMMENT ON COLUMN public.workspaces.slug IS
  'Workspace slug written by create_organization() as "<org-slug>-general". '
  'Added in 113 to repair drift: the column existed on remote but in no migration.';

-- ---------------------------------------------------------------------------
-- 2. money_accounts.user_id — relax instead of drop.
-- ---------------------------------------------------------------------------
-- Remote has no such column at all, so the faithful mirror would be DROP COLUMN.
-- We only DROP NOT NULL, on purpose: dropping a column is irreversible and would
-- destroy data in any environment that still carries legacy per-user accounts,
-- which cannot be verified from here. Relaxing the constraint is enough to
-- un-break every write path (no code sets user_id, so inserts simply leave it
-- NULL) and is safe everywhere. Dropping the vestigial column can follow once
-- every environment is confirmed to have no data in it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'money_accounts'
      AND column_name = 'user_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.money_accounts ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;

COMMIT;
