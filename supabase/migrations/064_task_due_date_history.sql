-- ============================================================
-- Migration 064: Task due-date change history
-- ============================================================
-- Changing a task's deadline is a business action, not a silent field edit.
-- This migration adds the immutable history table that records every change:
--
--   task_due_date_changes — old/new date, classified change_type, reason, actor.
--
-- Used for: reschedule analytics, overdue diagnosis, AI recommendations,
-- planning-quality signals, project-health, and audit trail.
--
-- The due_date column itself already exists on public.todos (DATE), and the
-- supporting due_date / smart-sort indexes already exist (migration 061), so we
-- do NOT add duplicate indexes on todos here.
-- ============================================================


-- ============================================================
-- 1. TASK_DUE_DATE_CHANGES
-- ============================================================
-- Immutable log: one row per accepted due-date change.
--
-- change_type:
--   'set'        — задача не имела срока, теперь установлен
--   'extended'   — новая дата позже старой (продление)
--   'shortened'  — новая дата раньше старой
--   'changed'    — общее изменение (fallback)
--   'removed'    — срок снят (зарезервировано; в MVP UI не используется)
--
-- organization_id / workspace_id берутся из серверного контекста, НЕ из
-- клиентского payload. FK на todos с ON DELETE CASCADE: история живёт ровно
-- столько, сколько живёт задача.

CREATE TABLE IF NOT EXISTS public.task_due_date_changes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id    UUID                 REFERENCES public.workspaces(id)     ON DELETE SET NULL,
  task_id         UUID        NOT NULL REFERENCES public.todos(id)          ON DELETE CASCADE,

  old_due_date    DATE,
  new_due_date    DATE,

  change_type     TEXT        NOT NULL
                    CHECK (change_type IN ('set', 'extended', 'shortened', 'changed', 'removed')),
  reason          TEXT        CHECK (reason IS NULL OR length(reason) <= 500),

  changed_by      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_due_date_changes IS
  'Immutable history of task due-date changes. Append-only — never UPDATE/DELETE. Drives reschedule analytics, overdue diagnosis, AI context, audit trail.';

COMMENT ON COLUMN public.task_due_date_changes.change_type IS
  'set | extended | shortened | changed | removed — classified server-side from old vs new date.';

-- ── Indexes под основные паттерны чтения ────────────────────
CREATE INDEX IF NOT EXISTS idx_task_due_date_changes_task_id
  ON public.task_due_date_changes(task_id);

CREATE INDEX IF NOT EXISTS idx_task_due_date_changes_workspace_id
  ON public.task_due_date_changes(workspace_id);

CREATE INDEX IF NOT EXISTS idx_task_due_date_changes_changed_at
  ON public.task_due_date_changes(changed_at DESC);

-- Аналитика "сколько раз переносили срок" по организации за период.
CREATE INDEX IF NOT EXISTS idx_task_due_date_changes_org_changed_at
  ON public.task_due_date_changes(organization_id, changed_at DESC);


-- ============================================================
-- 2. RLS — task_due_date_changes
-- ============================================================
-- SELECT: член org видит историю изменений по своей организации.
-- INSERT: writer-роль (can_write_data) и только от своего имени (WITH CHECK).
-- UPDATE/DELETE: политик нет → запрещено для всех (deny by default, immutable).

ALTER TABLE public.task_due_date_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_due_date_changes_select" ON public.task_due_date_changes;
CREATE POLICY "task_due_date_changes_select"
  ON public.task_due_date_changes
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "task_due_date_changes_insert" ON public.task_due_date_changes;
CREATE POLICY "task_due_date_changes_insert"
  ON public.task_due_date_changes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND changed_by = auth.uid()
    -- Запись истории допустима только для задачи из той же доступной org.
    AND EXISTS (
      SELECT 1 FROM public.todos t
      WHERE t.id = task_id
        AND t.organization_id = organization_id
    )
  );

-- UPDATE/DELETE — нет политик → запрещено.


-- ============================================================
-- VERIFICATION (run manually after apply)
-- ============================================================
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'task_due_date_changes';
--
-- SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'task_due_date_changes';
--   -- expect: select, insert only (no update/delete).
-- ============================================================
