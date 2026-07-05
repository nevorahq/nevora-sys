-- ============================================================
-- Migration 080: Capture Inbox Foundation
-- ============================================================
-- Adds the missing INPUT layer of Nevora Business OS: a thin product surface
-- where a user quickly captures a raw thought / obligation / signal, AI turns it
-- into a reviewable suggestion, and the user accepts / edits / rejects it. On
-- accept the EXISTING module services create the real Business OS entity — this
-- layer never owns business logic and never posts money.
--
--   raw user input
--     -> planner_entries        (this migration)
--     -> AI intent detection    (modules/planner/services/detect-planner-intent)
--     -> planner_suggestions    (this migration)
--     -> accept / edit / reject -> EXISTING module service (task / financial task / link)
--     -> entity_links + domain_events + action_items (all existing)
--
-- Design decisions (see audit):
--   * No second Action Center, no separate AI Planner engine, no goals table.
--   * Financial capture NEVER auto-creates a money transaction. Money-related
--     inputs may only become a financial task / reminder / review action item.
--   * organization_id / workspace_id are always taken from the server context;
--     RLS below is defense-in-depth against a spoofed client payload.
--
-- This migration:
--   A. planner_entries        — raw captured input
--   B. planner_suggestions    — AI proposals awaiting user review
--   C. Indexes for the Inbox / Review access paths
--   D. RLS (mirrors migration 048 conventions: is_org_member + can_write_data)

BEGIN;

-- ============================================================
-- A. planner_entries — raw captured input
-- ============================================================
-- One row per capture. Holds the raw text (or a pointer to a source entity)
-- until AI detection turns it into structured suggestions. Lifecycle:
--   captured -> processing -> suggested -> accepted | rejected | archived | failed
CREATE TABLE IF NOT EXISTS public.planner_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id    uuid NULL     REFERENCES public.workspaces(id)    ON DELETE SET NULL,

  raw_text   text NULL,
  -- Shape of the captured input. MVP is text-first; file/photo/link/voice are
  -- reserved so the enum does not need a follow-up migration.
  entry_type text NOT NULL DEFAULT 'text',
  -- Where the capture originated. 'manual' = typed in the Inbox; the others let
  -- other modules push signals into the same review queue later.
  source     text NOT NULL DEFAULT 'manual',
  status     text NOT NULL DEFAULT 'captured',

  ai_detected_intent text    NULL,
  ai_confidence      numeric NULL,

  -- Optional pointers to the entity that seeded this capture (kept nullable and
  -- FK-free by design: a capture may reference an entity that is later deleted,
  -- and cross-module FKs would couple the input layer to every module).
  source_document_id     uuid NULL,
  source_task_id         uuid NULL,
  source_subscription_id uuid NULL,
  source_transaction_id  uuid NULL,
  source_project_id      uuid NULL,

  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT planner_entries_entry_type_check CHECK (
    entry_type IN ('text', 'file', 'photo', 'link', 'voice', 'document')
  ),
  CONSTRAINT planner_entries_source_check CHECK (
    source IN ('manual', 'document', 'subscription', 'money', 'task', 'system')
  ),
  CONSTRAINT planner_entries_status_check CHECK (
    status IN ('captured', 'processing', 'suggested', 'accepted', 'rejected', 'archived', 'failed')
  ),
  CONSTRAINT planner_entries_ai_confidence_check CHECK (
    ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)
  ),
  -- A text-first capture must carry text unless it is backed by a source entity.
  CONSTRAINT planner_entries_has_content CHECK (
    raw_text IS NOT NULL
    OR source_document_id IS NOT NULL
    OR source_task_id IS NOT NULL
    OR source_subscription_id IS NOT NULL
    OR source_transaction_id IS NOT NULL
    OR source_project_id IS NOT NULL
  )
);

COMMENT ON TABLE public.planner_entries IS
  'Capture Inbox: raw user input before it becomes a structured suggestion. Never owns business logic.';

-- ============================================================
-- B. planner_suggestions — reviewable AI proposals
-- ============================================================
-- AI output the user can accept / edit / reject. proposed_payload is the
-- whitelisted input for the EXISTING module service that runs on accept; it is
-- re-validated per suggestion_type at accept time (never mass-assigned).
CREATE TABLE IF NOT EXISTS public.planner_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id    uuid NULL     REFERENCES public.workspaces(id)    ON DELETE SET NULL,

  planner_entry_id uuid NOT NULL REFERENCES public.planner_entries(id) ON DELETE CASCADE,

  suggestion_type text NOT NULL,
  title           text NOT NULL,
  description     text NULL,

  proposed_payload jsonb   NOT NULL DEFAULT '{}'::jsonb,
  confidence       numeric NOT NULL DEFAULT 0,

  status text NOT NULL DEFAULT 'pending',

  -- After accept: what existing entity this suggestion materialized into.
  accepted_entity_type text NULL,
  accepted_entity_id   uuid NULL,
  -- Optional free-form reason captured on reject (audit trail, never deleted).
  reject_reason text NULL,

  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT planner_suggestions_type_check CHECK (
    suggestion_type IN (
      'create_task',
      'create_financial_task',
      'create_document',
      'create_subscription_reminder',
      'create_money_reminder',
      'link_entities',
      'assign_project',
      'create_project',
      'create_action_item'
    )
  ),
  CONSTRAINT planner_suggestions_status_check CHECK (
    status IN ('pending', 'accepted', 'edited', 'rejected', 'expired', 'failed')
  ),
  CONSTRAINT planner_suggestions_confidence_check CHECK (
    confidence >= 0 AND confidence <= 1
  )
);

COMMENT ON TABLE public.planner_suggestions IS
  'Capture Inbox: AI proposals awaiting user review. On accept, existing module services execute — this table never creates money transactions.';

-- ============================================================
-- C. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS planner_entries_organization_id_idx ON public.planner_entries(organization_id);
CREATE INDEX IF NOT EXISTS planner_entries_workspace_id_idx    ON public.planner_entries(workspace_id);
CREATE INDEX IF NOT EXISTS planner_entries_status_idx          ON public.planner_entries(status);
CREATE INDEX IF NOT EXISTS planner_entries_entry_type_idx      ON public.planner_entries(entry_type);
CREATE INDEX IF NOT EXISTS planner_entries_created_at_idx      ON public.planner_entries(created_at DESC);

CREATE INDEX IF NOT EXISTS planner_suggestions_organization_id_idx ON public.planner_suggestions(organization_id);
CREATE INDEX IF NOT EXISTS planner_suggestions_workspace_id_idx    ON public.planner_suggestions(workspace_id);
CREATE INDEX IF NOT EXISTS planner_suggestions_planner_entry_id_idx ON public.planner_suggestions(planner_entry_id);
CREATE INDEX IF NOT EXISTS planner_suggestions_status_idx          ON public.planner_suggestions(status);
CREATE INDEX IF NOT EXISTS planner_suggestions_type_idx            ON public.planner_suggestions(suggestion_type);
CREATE INDEX IF NOT EXISTS planner_suggestions_created_at_idx      ON public.planner_suggestions(created_at DESC);

-- ============================================================
-- D. RLS (mirrors migration 048: is_org_member for read, can_write_data for write)
-- ============================================================
-- organization_id is always set from the server context; these policies are the
-- database-level backstop so a spoofed payload can never cross tenants.
ALTER TABLE public.planner_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planner_suggestions ENABLE ROW LEVEL SECURITY;

-- ── planner_entries ──────────────────────────────────────────────────────────
CREATE POLICY "planner_entries_select"
  ON public.planner_entries FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY "planner_entries_insert"
  ON public.planner_entries FOR INSERT
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "planner_entries_update"
  ON public.planner_entries FOR UPDATE
  USING (public.is_org_member(organization_id) AND public.can_write_data(organization_id))
  WITH CHECK (public.is_org_member(organization_id) AND public.can_write_data(organization_id));

-- ── planner_suggestions ──────────────────────────────────────────────────────
CREATE POLICY "planner_suggestions_select"
  ON public.planner_suggestions FOR SELECT
  USING (public.is_org_member(organization_id));

CREATE POLICY "planner_suggestions_insert"
  ON public.planner_suggestions FOR INSERT
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "planner_suggestions_update"
  ON public.planner_suggestions FOR UPDATE
  USING (public.is_org_member(organization_id) AND public.can_write_data(organization_id))
  WITH CHECK (public.is_org_member(organization_id) AND public.can_write_data(organization_id));

COMMIT;
