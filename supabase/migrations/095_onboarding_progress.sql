-- ============================================================
-- Migration 095: Onboarding Progress (Phase B / B2)
-- ============================================================
-- Backs the First Action Wizard. One row per (organization, user): onboarding is
-- a property of a person inside an org, not of the org — an invited member gets
-- their own first-run experience without replaying the owner's.
--
-- The row is a funnel, and each timestamp is one step of it (Phase B / B7):
--
--   started_at              onboarding_started
--   selected_at             first_action_selected
--   first_action_completed_at   the entity (document/subscription/task/capture) exists
--   first_workflow_completed_at the draft was confirmed  <- activation
--   dismissed_at            the user skipped the wizard
--
-- Deliberately NOT a state machine column: the steps are monotonic and a
-- timestamp records *when*, which the activation metrics need anyway
-- ("time to first confirmed action"). A status enum would throw that away.
--
-- This migration:
--   A. onboarding_progress + constraints
--   B. Indexes
--   C. RLS — note it does NOT gate writes on can_write_data (see below)

BEGIN;

-- ============================================================
-- A. onboarding_progress
-- ============================================================
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id)           ON DELETE CASCADE,

  -- Which of the four allowed first actions the user picked (Phase B / B0).
  selected_first_action text NULL,

  -- The capture row seeded for the first action, and the draft it produced.
  -- Both are the idempotency witnesses for reconcileFirstAction: if
  -- first_entry_id is set, the draft was already seeded and must not be seeded
  -- again. FK-free like planner_entries' own source pointers (migration 080) —
  -- a deleted capture must not cascade-delete the funnel record.
  first_entry_id uuid NULL,
  first_draft_id uuid NULL,

  started_at                  timestamptz NOT NULL DEFAULT now(),
  selected_at                 timestamptz NULL,
  first_action_completed_at   timestamptz NULL,
  first_workflow_completed_at timestamptz NULL,
  dismissed_at                timestamptz NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One funnel per person per org.
  CONSTRAINT onboarding_progress_org_user_key UNIQUE (organization_id, user_id),

  CONSTRAINT onboarding_progress_first_action_check CHECK (
    selected_first_action IS NULL
    OR selected_first_action IN (
      'upload_document',
      'add_subscription',
      'create_task',
      'capture_inbox_item'
    )
  ),

  -- A selection is what starts the clock; the later steps cannot precede it.
  CONSTRAINT onboarding_progress_selection_pairing CHECK (
    (selected_first_action IS NULL) = (selected_at IS NULL)
  ),
  CONSTRAINT onboarding_progress_completion_order CHECK (
    first_action_completed_at IS NULL OR selected_at IS NOT NULL
  ),
  -- The workflow is complete only once the entity it acts on exists. This is the
  -- database-level statement of the Phase B loop: no confirmed workflow without a
  -- first action behind it.
  CONSTRAINT onboarding_progress_workflow_order CHECK (
    first_workflow_completed_at IS NULL OR first_action_completed_at IS NOT NULL
  )
);

COMMENT ON TABLE public.onboarding_progress IS
  'Phase B First Action Wizard funnel: one row per (organization, user). Timestamps are the activation metrics, not UI state.';
COMMENT ON COLUMN public.onboarding_progress.first_entry_id IS
  'planner_entries.id seeded for the first action. Presence makes draft seeding idempotent. Intentionally FK-free.';
COMMENT ON COLUMN public.onboarding_progress.first_draft_id IS
  'planner_suggestions.id of the draft the first action produced. Intentionally FK-free.';

-- ============================================================
-- B. Indexes
-- ============================================================
-- The wizard asks exactly one question on every dashboard render: "is this user
-- done?". The UNIQUE constraint above already serves that lookup.
-- This partial index serves the reconcile path: users mid-funnel.
CREATE INDEX IF NOT EXISTS onboarding_progress_in_flight_idx
  ON public.onboarding_progress (organization_id, user_id)
  WHERE first_workflow_completed_at IS NULL AND dismissed_at IS NULL;

-- ============================================================
-- C. RLS
-- ============================================================
-- Deliberately NOT gated on can_write_data, unlike the business tables.
-- can_write_data goes false on an expired trial, and an onboarding row is not
-- business data — it is the record of the user's own first run. Gating it would
-- make an expired-trial user unable to dismiss their own wizard, and would emit
-- the same silent RLS-denied noise the Action Center sync used to.
--
-- Scoping is per-user, not per-org: a member must never read or rewrite a
-- colleague's funnel.
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_progress_select"
  ON public.onboarding_progress FOR SELECT
  USING (public.is_org_member(organization_id) AND user_id = auth.uid());

CREATE POLICY "onboarding_progress_insert"
  ON public.onboarding_progress FOR INSERT
  WITH CHECK (public.is_org_member(organization_id) AND user_id = auth.uid());

CREATE POLICY "onboarding_progress_update"
  ON public.onboarding_progress FOR UPDATE
  USING (public.is_org_member(organization_id) AND user_id = auth.uid())
  WITH CHECK (public.is_org_member(organization_id) AND user_id = auth.uid());

COMMIT;
