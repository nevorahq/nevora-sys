-- ============================================================
-- Migration 061: Task smart sorting (server-side / database-level)
-- ============================================================
-- Adds a business-importance default order for tasks:
--   active-overdue -> high -> medium -> low -> no-priority, closed last.
--
-- "Overdue" depends on CURRENT_DATE, so it cannot be an immutable generated
-- column. The stable parts (priority weight, closed flag) become generated
-- STORED columns (indexable); the date-dependent overdue flag is computed by a
-- read-only view. The view is security_invoker so it inherits the exact RLS of
-- todos/projects — tenant isolation is unchanged.
--
-- Statuses here are todo / in_progress / done (migration 055); the only closed
-- status is 'done'. The closed predicate is written defensively so it keeps
-- working if more terminal statuses are added later.
-- ============================================================


-- ── 1. Generated, indexable sort keys ───────────────────────

-- Priority weight: high=1, medium=2, low=3, anything else (incl. NULL)=4.
ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS priority_weight SMALLINT
    GENERATED ALWAYS AS (
      CASE priority
        WHEN 'high'   THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low'    THEN 3
        ELSE 4
      END
    ) STORED;

COMMENT ON COLUMN public.todos.priority_weight IS
  'Sort weight derived from priority (high=1..none=4). Generated, indexable.';

-- Closed flag: 1 for terminal statuses, 0 for active. Today only 'done' is
-- terminal; the IN-list leaves room for future terminal statuses.
ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS is_closed SMALLINT
    GENERATED ALWAYS AS (
      CASE WHEN status IN ('done', 'completed', 'cancelled', 'archived') THEN 1 ELSE 0 END
    ) STORED;

COMMENT ON COLUMN public.todos.is_closed IS
  'Generated 1/0 terminal-status flag. Active tasks (0) sort above closed (1).';


-- ── 2. Composite indexes for the sort paths ─────────────────
-- Lead with the tenant/scope column, then the stable sort keys. The overdue
-- reorder runs on top of this already-narrow, pre-ordered set.

CREATE INDEX IF NOT EXISTS todos_smart_sort_idx
  ON public.todos (organization_id, is_closed, priority_weight, due_date, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS todos_project_smart_sort_idx
  ON public.todos (project_id, is_closed, priority_weight, due_date, created_at DESC)
  WHERE deleted_at IS NULL;

-- Supports the due_date_asc / due_date_desc modes scoped to an organization.
CREATE INDEX IF NOT EXISTS todos_org_due_date_idx
  ON public.todos (organization_id, due_date)
  WHERE deleted_at IS NULL;


-- ── 3. Sortable view ────────────────────────────────────────
-- security_invoker = true  -> RLS of todos AND projects is evaluated as the
-- querying user (NOT the view owner), so the view can never leak rows the user
-- could not already read. Project fields are denormalized via LEFT JOIN to keep
-- PostgREST embedding out of the hot path.

DROP VIEW IF EXISTS public.task_smart_list;
CREATE VIEW public.task_smart_list
  WITH (security_invoker = true)
  AS
SELECT
  t.*,
  CASE
    WHEN t.is_closed = 0
      AND t.due_date IS NOT NULL
      AND t.due_date < CURRENT_DATE
    THEN 0
    ELSE 1
  END                AS sort_overdue,
  p.name             AS project_name,
  p.color            AS project_color,
  p.status           AS project_status
FROM public.todos t
LEFT JOIN public.projects p ON p.id = t.project_id;

COMMENT ON VIEW public.task_smart_list IS
  'Read-only sortable projection of todos. security_invoker: inherits todos/projects RLS. sort_overdue=0 for active overdue tasks.';

GRANT SELECT ON public.task_smart_list TO authenticated;


-- ============================================================
-- VERIFICATION (run manually after apply)
-- ============================================================
-- Default smart order for one org:
--   SELECT title, status, priority, due_date, sort_overdue, is_closed, priority_weight
--   FROM public.task_smart_list
--   WHERE organization_id = '<org>' AND deleted_at IS NULL
--   ORDER BY sort_overdue ASC, is_closed ASC, priority_weight ASC,
--            due_date ASC NULLS LAST, created_at DESC
--   LIMIT 50;
--
-- An overdue low task must rank above a not-overdue high task.
-- A done task with a past due_date must have sort_overdue = 1 (not overdue).
-- ============================================================
