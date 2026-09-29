-- ============================================================
-- Migration 125: Learned project rules for captures (ADR 002, 0.2b follow-up)
-- ============================================================
-- A capture's "category" is its project (0.2b). Classification is rule-first,
-- AI second: when a user files a capture from a known SOURCE under a different
-- project than the one proposed, that correction becomes the user's private
-- rule, and the next capture from the same source is filed there without the
-- model guessing. Mirrors expense_classification_rules (Money).
--
--   A. planner_entries.channel_signals — where a channel capture came from, in
--      a form a rule can match: {"slack_channel": "T1:C1", "slack_channel_label":
--      "#acme", "email_sender": "anna@acme.com", "email_domain": "acme.com"}.
--      Written by the channel adapters (service role); '{}' for in-app captures.
--   B. capture_project_rules — one rule per (org, user, signal): signal → project.
--      Private: a user reads and writes only their own. The project must belong
--      to the same organization; deleting it deletes its rules.
--
-- Additive and idempotent: safe to re-run.

BEGIN;

-- ── A. planner_entries.channel_signals ──────────────────────────────────────
ALTER TABLE public.planner_entries
  ADD COLUMN IF NOT EXISTS channel_signals jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.planner_entries
  DROP CONSTRAINT IF EXISTS planner_entries_channel_signals_check;
ALTER TABLE public.planner_entries
  ADD CONSTRAINT planner_entries_channel_signals_check
  CHECK (jsonb_typeof(channel_signals) = 'object' AND pg_column_size(channel_signals) <= 2048);

COMMENT ON COLUMN public.planner_entries.channel_signals IS
  'ADR 002: source of a channel capture a project rule can match (slack_channel, email_sender, email_domain + display labels). {} for in-app captures.';

-- ── B. capture_project_rules ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.capture_project_rules (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_user_id   uuid        NOT NULL REFERENCES auth.users(id)          ON DELETE CASCADE,
  signal_type     text        NOT NULL,
  -- Normalized: "<team or enterprise id>:<channel id>", a lower-case address or domain.
  signal_value    text        NOT NULL,
  -- Display only ("#acme-support"); never used for matching.
  signal_label    text        NULL,
  project_id      uuid        NOT NULL REFERENCES public.projects(id)     ON DELETE CASCADE,
  hits            integer     NOT NULL DEFAULT 0,
  last_used_at    timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT capture_project_rules_signal_type_check
    CHECK (signal_type IN ('slack_channel', 'email_sender', 'email_domain')),
  CONSTRAINT capture_project_rules_signal_value_check
    CHECK (char_length(signal_value) BETWEEN 1 AND 320),
  CONSTRAINT capture_project_rules_signal_label_check
    CHECK (signal_label IS NULL OR char_length(signal_label) <= 200),
  CONSTRAINT capture_project_rules_hits_check CHECK (hits >= 0)
);

-- One rule per user and source: a new correction replaces the old target.
CREATE UNIQUE INDEX IF NOT EXISTS capture_project_rules_owner_signal_uq
  ON public.capture_project_rules (organization_id, owner_user_id, signal_type, signal_value);
CREATE INDEX IF NOT EXISTS capture_project_rules_project_idx
  ON public.capture_project_rules (project_id);

DROP TRIGGER IF EXISTS capture_project_rules_updated_at ON public.capture_project_rules;
CREATE TRIGGER capture_project_rules_updated_at
  BEFORE UPDATE ON public.capture_project_rules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.capture_project_rules ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.capture_project_rules FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.capture_project_rules TO authenticated;
GRANT ALL ON TABLE public.capture_project_rules TO service_role;

-- Private rules: only the owner, only while a member of the organization.
DROP POLICY IF EXISTS "capture_project_rules_select_own" ON public.capture_project_rules;
CREATE POLICY "capture_project_rules_select_own"
  ON public.capture_project_rules FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() AND public.is_org_member(organization_id));

-- Writes also need write access, and the project must be in the same organization.
DROP POLICY IF EXISTS "capture_project_rules_insert_own" ON public.capture_project_rules;
CREATE POLICY "capture_project_rules_insert_own"
  ON public.capture_project_rules FOR INSERT TO authenticated
  WITH CHECK (
    owner_user_id = auth.uid()
    AND public.can_write_data(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.organization_id = capture_project_rules.organization_id
    )
  );

DROP POLICY IF EXISTS "capture_project_rules_update_own" ON public.capture_project_rules;
CREATE POLICY "capture_project_rules_update_own"
  ON public.capture_project_rules FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() AND public.can_write_data(organization_id))
  WITH CHECK (
    owner_user_id = auth.uid()
    AND public.can_write_data(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND p.organization_id = capture_project_rules.organization_id
    )
  );

DROP POLICY IF EXISTS "capture_project_rules_delete_own" ON public.capture_project_rules;
CREATE POLICY "capture_project_rules_delete_own"
  ON public.capture_project_rules FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

COMMENT ON TABLE public.capture_project_rules IS
  'ADR 002: a user''s private "captures from this source go to this project" rule, learned when they change a draft''s project on accept.';

COMMIT;

-- Verify:
--   SELECT to_regclass('public.capture_project_rules');
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'planner_entries' AND column_name = 'channel_signals';
