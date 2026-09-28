-- ============================================================
-- Migration 121: Channel intake (ADR 002, step 1)
-- ============================================================
-- External channels (Telegram first; Slack and email forwarding later) feed the
-- same Capture Inbox as manual input. A channel adapter verifies the inbound
-- request, maps the external sender to a Nevora user, and hands the content to
-- the shared intake. This migration adds the three things every adapter needs:
--
--   A. channel_integrations  — which external account belongs to which user.
--   B. channel_link_codes    — one-time codes a signed-in user issues in
--                              Settings and sends to the bot (/start <code>).
--   C. planner_entries.channel + channel_message_key — where a capture came
--      from, and a per-channel message key so a redelivered message (Telegram
--      retries a webhook until it gets a 200) yields exactly one capture.
--
-- Writes to A and the consumption of B happen server-side with the service
-- role (the webhook has no user session). Users only read their own rows,
-- issue codes for themselves and disconnect their own integrations.
--
-- Additive and idempotent: safe to re-run.

BEGIN;

-- ── A. channel_integrations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.channel_integrations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id     uuid        NULL     REFERENCES public.workspaces(id)    ON DELETE SET NULL,
  user_id          uuid        NOT NULL REFERENCES auth.users(id)          ON DELETE CASCADE,
  channel          text        NOT NULL,
  -- The sender's stable id on that channel (Telegram: from.id).
  external_user_id text        NOT NULL,
  -- Where replies go (Telegram: chat.id of the private chat with the bot).
  external_chat_id text        NULL,
  -- Display only (Telegram @username), may change; never used for matching.
  external_username text       NULL,
  status           text        NOT NULL DEFAULT 'active',
  created_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz NULL,

  CONSTRAINT channel_integrations_channel_check CHECK (channel IN ('telegram', 'slack', 'email')),
  CONSTRAINT channel_integrations_status_check CHECK (status IN ('active', 'revoked')),
  CONSTRAINT channel_integrations_revoked_at_check CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

-- One external account maps to one Nevora user at a time …
CREATE UNIQUE INDEX IF NOT EXISTS channel_integrations_active_external_uq
  ON public.channel_integrations (channel, external_user_id)
  WHERE status = 'active';
-- … and a user has at most one active integration per channel per organization.
CREATE UNIQUE INDEX IF NOT EXISTS channel_integrations_active_user_uq
  ON public.channel_integrations (organization_id, user_id, channel)
  WHERE status = 'active';

ALTER TABLE public.channel_integrations ENABLE ROW LEVEL SECURITY;

-- Least privilege: users read their own row and may only flip it to revoked
-- (column-level UPDATE); creation is the webhook's job (service role).
REVOKE ALL ON TABLE public.channel_integrations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.channel_integrations TO authenticated;
GRANT UPDATE (status, revoked_at) ON TABLE public.channel_integrations TO authenticated;
GRANT ALL ON TABLE public.channel_integrations TO service_role;

DROP POLICY IF EXISTS "channel_integrations_select_own" ON public.channel_integrations;
CREATE POLICY "channel_integrations_select_own"
  ON public.channel_integrations FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));

-- Disconnect only: a user may revoke their own active integration.
DROP POLICY IF EXISTS "channel_integrations_revoke_own" ON public.channel_integrations;
CREATE POLICY "channel_integrations_revoke_own"
  ON public.channel_integrations FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'active')
  WITH CHECK (user_id = auth.uid() AND status = 'revoked');

COMMENT ON TABLE public.channel_integrations IS
  'ADR 002: external channel account (Telegram, …) linked to a Nevora user. Created by the channel webhook (service role) after a /start <code>; revoked by the user.';

-- ── B. channel_link_codes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.channel_link_codes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id    uuid        NULL     REFERENCES public.workspaces(id)    ON DELETE SET NULL,
  user_id         uuid        NOT NULL REFERENCES auth.users(id)          ON DELETE CASCADE,
  channel         text        NOT NULL,
  -- SHA-256 of the code; the plain code is shown to the user once, never stored.
  code_hash       text        NOT NULL,
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT channel_link_codes_channel_check CHECK (channel IN ('telegram', 'slack', 'email')),
  CONSTRAINT channel_link_codes_hash_check CHECK (code_hash ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS channel_link_codes_hash_uq
  ON public.channel_link_codes (code_hash);
CREATE INDEX IF NOT EXISTS channel_link_codes_user_idx
  ON public.channel_link_codes (user_id, channel, created_at DESC);

ALTER TABLE public.channel_link_codes ENABLE ROW LEVEL SECURITY;

-- Users issue and see their own codes; only the webhook (service role) claims one.
REVOKE ALL ON TABLE public.channel_link_codes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.channel_link_codes TO authenticated;
GRANT ALL ON TABLE public.channel_link_codes TO service_role;

DROP POLICY IF EXISTS "channel_link_codes_insert_own" ON public.channel_link_codes;
CREATE POLICY "channel_link_codes_insert_own"
  ON public.channel_link_codes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
    AND used_at IS NULL
    AND expires_at <= now() + interval '1 hour'
  );

DROP POLICY IF EXISTS "channel_link_codes_select_own" ON public.channel_link_codes;
CREATE POLICY "channel_link_codes_select_own"
  ON public.channel_link_codes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.channel_link_codes IS
  'ADR 002: one-time code linking an external channel account to the issuing user. Stored hashed; consumed once by the channel webhook (service role).';

-- ── C. planner_entries: channel + per-channel message key ──────────────────
ALTER TABLE public.planner_entries
  ADD COLUMN IF NOT EXISTS channel text NULL,
  ADD COLUMN IF NOT EXISTS channel_message_key text NULL;

ALTER TABLE public.planner_entries
  DROP CONSTRAINT IF EXISTS planner_entries_channel_check;
ALTER TABLE public.planner_entries
  ADD CONSTRAINT planner_entries_channel_check CHECK (
    (channel IS NULL AND channel_message_key IS NULL)
    OR (channel IN ('telegram', 'slack', 'email') AND channel_message_key IS NOT NULL
        AND length(channel_message_key) BETWEEN 1 AND 200)
  );

-- 'channel' joins the source dictionary for text captures that arrived from a
-- channel (a channel file capture keeps source 'document' plus `channel`).
ALTER TABLE public.planner_entries
  DROP CONSTRAINT IF EXISTS planner_entries_source_check;
ALTER TABLE public.planner_entries
  ADD CONSTRAINT planner_entries_source_check CHECK (
    source IN ('manual', 'document', 'subscription', 'money', 'task', 'system', 'channel')
  );

CREATE UNIQUE INDEX IF NOT EXISTS planner_entries_channel_message_uq
  ON public.planner_entries (organization_id, channel, channel_message_key)
  WHERE channel_message_key IS NOT NULL;

COMMENT ON COLUMN public.planner_entries.channel IS
  'ADR 002: external channel a capture arrived from (telegram, slack, email); NULL for in-app captures.';
COMMENT ON COLUMN public.planner_entries.channel_message_key IS
  'ADR 002: the message id on that channel (Telegram: <chat_id>:<message_id>); unique per org + channel so a redelivery is one capture.';

COMMIT;

-- Verify:
--   SELECT to_regclass('public.channel_integrations'), to_regclass('public.channel_link_codes');
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'planner_entries' AND column_name IN ('channel', 'channel_message_key');
