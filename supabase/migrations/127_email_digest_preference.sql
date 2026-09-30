-- ============================================================
-- Migration 127: Email digest switch (ADR 003, step 2)
-- ============================================================
-- The daily digest also goes by email to members who have NOT linked Telegram
-- in that organization (a user never gets both). This adds the user's switch
-- for it. Default ON, like the Telegram one: it is an account notice about the
-- user's own work, turned off in Settings → Notifications or from the link in
-- every message. notification_digests (126) already accepts channel 'email'.
--
-- Additive and idempotent: safe to re-run.

BEGIN;

ALTER TABLE public.user_notification_preferences
  ADD COLUMN IF NOT EXISTS email_digest_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.user_notification_preferences.email_digest_enabled IS
  'ADR 003: send the daily Action Center digest by email when Telegram is not linked in this organization.';

COMMIT;

-- Verify:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'user_notification_preferences' AND column_name = 'email_digest_enabled';
