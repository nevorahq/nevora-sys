-- ============================================================
-- Migration 126: Daily notification digest (ADR 003, step 1 — Telegram)
-- ============================================================
-- One summary per user per organization per local day, sent outside the app
-- (Telegram first; email later) with what the Action Center shows: overdue,
-- due today, everything that needs attention. The in-app bell and Action
-- Center are unchanged — the digest is an extra delivery, never a state change.
--
--   A. user_notification_preferences.telegram_digest_enabled / digest_hour —
--      the user's switch and the local hour the digest goes out (default 09:00,
--      the hour date-only reminders already use). Default ON: the digest only
--      reaches users who linked Telegram themselves.
--   B. notification_digests — one row per (org, user, channel, local_date): the
--      idempotency key of the hourly sweep and its delivery log. Users read
--      their own rows; only the service role writes.
--
-- Additive and idempotent: safe to re-run.

BEGIN;

-- ── A. Preferences ──────────────────────────────────────────────────────────
ALTER TABLE public.user_notification_preferences
  ADD COLUMN IF NOT EXISTS telegram_digest_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS digest_hour smallint NOT NULL DEFAULT 9;

ALTER TABLE public.user_notification_preferences
  DROP CONSTRAINT IF EXISTS user_notification_preferences_digest_hour_check;
ALTER TABLE public.user_notification_preferences
  ADD CONSTRAINT user_notification_preferences_digest_hour_check
  CHECK (digest_hour BETWEEN 0 AND 23);

COMMENT ON COLUMN public.user_notification_preferences.telegram_digest_enabled IS
  'ADR 003: send the daily Action Center digest to the user''s linked Telegram chat.';
COMMENT ON COLUMN public.user_notification_preferences.digest_hour IS
  'ADR 003: local hour (0–23, user notification timezone) the daily digest goes out.';

-- ── B. notification_digests ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_digests (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id)          ON DELETE CASCADE,
  channel         text        NOT NULL,
  -- The user's calendar day the digest belongs to, in their notification timezone.
  local_date      date        NOT NULL,
  status          text        NOT NULL,
  attempts        smallint    NOT NULL DEFAULT 1,
  -- How many attention items the message summarized (0 for an empty day).
  item_count      integer     NOT NULL DEFAULT 0,
  -- Why a digest was skipped or failed (empty, quiet_hours, send_failed, …).
  reason          text        NULL,
  sent_at         timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_digests_channel_check CHECK (channel IN ('telegram', 'email')),
  CONSTRAINT notification_digests_status_check CHECK (status IN ('sent', 'skipped', 'failed')),
  CONSTRAINT notification_digests_attempts_check CHECK (attempts BETWEEN 1 AND 10),
  CONSTRAINT notification_digests_item_count_check CHECK (item_count >= 0),
  CONSTRAINT notification_digests_reason_check CHECK (reason IS NULL OR char_length(reason) <= 64),
  CONSTRAINT notification_digests_sent_at_check CHECK ((status = 'sent') = (sent_at IS NOT NULL))
);

-- The sweep's idempotency key: one digest per user, organization, channel and day.
CREATE UNIQUE INDEX IF NOT EXISTS notification_digests_daily_uq
  ON public.notification_digests (organization_id, user_id, channel, local_date);

DROP TRIGGER IF EXISTS notification_digests_updated_at ON public.notification_digests;
CREATE TRIGGER notification_digests_updated_at
  BEFORE UPDATE ON public.notification_digests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.notification_digests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.notification_digests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.notification_digests TO authenticated;
GRANT ALL ON TABLE public.notification_digests TO service_role;

DROP POLICY IF EXISTS "notification_digests_select_own" ON public.notification_digests;
CREATE POLICY "notification_digests_select_own"
  ON public.notification_digests FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));

COMMENT ON TABLE public.notification_digests IS
  'ADR 003: one daily digest per user, organization, channel and local day — the hourly sweep''s idempotency key and delivery log. Written only by the service role.';

COMMIT;

-- Verify:
--   SELECT to_regclass('public.notification_digests');
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'user_notification_preferences'
--     AND column_name IN ('telegram_digest_enabled', 'digest_hour');
