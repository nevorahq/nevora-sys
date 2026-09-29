-- ============================================================
-- Migration 123: channel_integrations.metadata (ADR 002, step 4)
-- ============================================================
-- Email forwarding: when a user sets up automatic forwarding in Gmail, Gmail
-- first mails a confirmation code to the new forwarding address — which is
-- ours. The inbound webhook stores that code on the user's email integration so
-- Settings can show it and the user can finish the Gmail setup. It is written
-- only by the webhook (service role); users read it with their own row.
--
-- Shape (email): {"forwarding_confirmation": {"code", "link", "requested_by",
-- "received_at"}}. Kept small and replaced, never appended.
--
-- Additive and idempotent: safe to re-run. No grant change — users keep their
-- column-level UPDATE on (status, revoked_at) only.

BEGIN;

ALTER TABLE public.channel_integrations
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.channel_integrations
  DROP CONSTRAINT IF EXISTS channel_integrations_metadata_check;
ALTER TABLE public.channel_integrations
  ADD CONSTRAINT channel_integrations_metadata_check
  CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192);

COMMENT ON COLUMN public.channel_integrations.metadata IS
  'ADR 002: channel-specific state written by the webhook (email: the pending Gmail forwarding confirmation).';

COMMIT;

-- Verify:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'channel_integrations' AND column_name = 'metadata';   -- jsonb
