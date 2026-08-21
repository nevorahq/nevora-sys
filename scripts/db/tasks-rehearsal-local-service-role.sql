-- Local rehearsal only: old Supabase snapshots may not contain the hosted
-- default privileges for service_role. Do not apply this file remotely.
\set ON_ERROR_STOP on

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
