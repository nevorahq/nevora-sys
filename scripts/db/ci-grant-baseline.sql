-- CI-only: reproduce Supabase hosted default privileges on a fresh local database.
--
-- Why this exists: a local `supabase db reset` applies migrations as role
-- `postgres`, whose default privileges grant `authenticated` only Dxtm
-- (DELETE/TRUNCATE/REFERENCES/TRIGGER) — NOT SELECT/INSERT/UPDATE. Hosted Supabase
-- grants `authenticated` those by default, so app tables like `domain_events`
-- (which have no explicit GRANT in any migration) are readable on hosted but throw
-- `permission denied` on a bare local reset. That divergence makes the RLS/isolation
-- harnesses fail locally for the wrong reason.
--
-- Fix: wipe `public` and set the hosted-like baseline BEFORE migrations run, so
-- every migration-created object inherits it and the explicit GRANT/REVOKE lines in
-- the migrations layer on top (e.g. 098's anon booking revoke still wins).
--
-- `anon` intentionally gets NO default grant here — hosted grants `anon` selectively,
-- so anon-lockdown (098) and authenticated-only objects (e.g. the
-- `organization_subscriptions` view) stay honestly denied for anon.
--
-- This file is CI/local-test plumbing only. It is NOT a migration and must not be
-- applied to the remote project.

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;
