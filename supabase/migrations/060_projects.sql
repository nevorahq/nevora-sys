-- ============================================================
-- Migration 060: Projects (Tasks module)
-- ============================================================
-- Projects are a first-class business entity inside the Tasks domain.
-- They group tasks under a real container (NOT a text category / tag),
-- so a project can later connect documents, money, subscriptions and AI.
--
-- Scope of this migration:
--   1. projects table (org + workspace scoped, soft archive via archived_at)
--   2. todos.project_id  (FK ON DELETE SET NULL — deleting a project never
--      deletes its tasks, it only detaches them)
--   3. indexes for the project + project-scoped task access patterns
--   4. recalculate_project_progress() — server-side progress, callable via rpc
--   5. updated_at trigger
--   6. RLS (soft archive is an UPDATE, there is no hard-DELETE policy)
--
-- Hierarchy: workspace -> project -> tasks. Task statuses already exist
-- (migration 055: todo / in_progress / done) and are reused. There is no
-- 'cancelled' status here, so "non-cancelled tasks" = all non-deleted tasks.
-- ============================================================


-- ── 1. projects table ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id)    ON DELETE CASCADE,
  name            TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  slug            TEXT NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 140),
  description     TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  priority        TEXT NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('low', 'medium', 'high')),
  owner_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  start_date      DATE,
  due_date        DATE,
  completed_at    TIMESTAMPTZ,
  color           TEXT,
  icon            TEXT,
  -- Server-computed: done / all non-deleted tasks * 100. Never trust the client.
  progress        SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at     TIMESTAMPTZ
);

COMMENT ON TABLE public.projects IS
  'Project container inside a workspace. Groups tasks; ready for cross-module links. Soft-archived via archived_at.';
COMMENT ON COLUMN public.projects.progress IS
  'Server-computed completion percentage. Maintained by recalculate_project_progress().';
COMMENT ON COLUMN public.projects.slug IS
  'URL-safe identifier, unique per workspace among non-archived projects.';

-- Slug is unique within a workspace, but only among live projects — an archived
-- project must not block reusing its slug for a new one.
CREATE UNIQUE INDEX IF NOT EXISTS projects_workspace_slug_unique
  ON public.projects (workspace_id, slug)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS projects_org_idx
  ON public.projects (organization_id);

CREATE INDEX IF NOT EXISTS projects_workspace_idx
  ON public.projects (workspace_id);

CREATE INDEX IF NOT EXISTS projects_workspace_status_idx
  ON public.projects (workspace_id, status)
  WHERE archived_at IS NULL;


-- ── 2. todos.project_id ─────────────────────────────────────
-- ON DELETE SET NULL: deleting a project detaches its tasks, never deletes them.

ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS project_id UUID
    REFERENCES public.projects(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.todos.project_id IS
  'Optional project this task belongs to. SET NULL on project delete.';

CREATE INDEX IF NOT EXISTS todos_project_idx
  ON public.todos (project_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS todos_workspace_project_idx
  ON public.todos (workspace_id, project_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS todos_workspace_project_status_idx
  ON public.todos (workspace_id, project_id, status)
  WHERE deleted_at IS NULL;


-- ── 3. Progress recalculation ───────────────────────────────
-- progress = done tasks / all non-deleted tasks * 100. No tasks => 0.
-- SECURITY DEFINER so it can update projects.progress regardless of the
-- caller's row-level write path, while still being scoped to one project id.
-- Application logic calls this via rpc after every task mutation — there is
-- no service-role key involved.

CREATE OR REPLACE FUNCTION public.recalculate_project_progress(p_project_id UUID)
RETURNS SMALLINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_total    INT;
  v_done     INT;
  v_progress SMALLINT;
BEGIN
  IF p_project_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Only the project's own org members may trigger a recalculation. Without
  -- this guard a member of another org could nudge an arbitrary project id.
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id
      AND public.is_org_member(p.organization_id)
  ) THEN
    RETURN 0;
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'done')
  INTO v_total, v_done
  FROM public.todos
  WHERE project_id = p_project_id
    AND deleted_at IS NULL;

  v_progress := CASE WHEN v_total = 0 THEN 0
                     ELSE floor(v_done::numeric * 100 / v_total)::SMALLINT END;

  UPDATE public.projects
  SET progress = v_progress,
      updated_at = now()
  WHERE id = p_project_id;

  RETURN v_progress;
END;
$$;

COMMENT ON FUNCTION public.recalculate_project_progress(UUID) IS
  'Recomputes projects.progress = done/all non-deleted tasks * 100. Org-member scoped.';

REVOKE ALL ON FUNCTION public.recalculate_project_progress(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_project_progress(UUID) TO authenticated;


-- ── 4. updated_at trigger ───────────────────────────────────

DROP TRIGGER IF EXISTS projects_updated_at ON public.projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ── 5. RLS ──────────────────────────────────────────────────

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- SELECT: any active member of the project's organization.
DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- INSERT: writer roles, and the row must be stamped with the creator.
DROP POLICY IF EXISTS "projects_insert" ON public.projects;
CREATE POLICY "projects_insert" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND created_by = auth.uid()
  );

-- UPDATE: writer roles. Covers edits AND soft archive (archived_at is set via
-- UPDATE, never a hard DELETE). WITH CHECK keeps the row inside the same org.
DROP POLICY IF EXISTS "projects_update" ON public.projects;
CREATE POLICY "projects_update" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id))
  WITH CHECK (public.can_write_data(organization_id));

-- No DELETE policy on purpose: archiving is a soft UPDATE.


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'projects';
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'todos' AND column_name = 'project_id';
-- SELECT public.recalculate_project_progress('<project-uuid>');
-- ============================================================
