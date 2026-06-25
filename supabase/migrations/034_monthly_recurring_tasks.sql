-- =============================================================================
-- Migration 034: Monthly recurring tasks
--
-- Recurrence belongs to the task record and is advanced in PostgreSQL when a
-- task is completed. This works from every completion path (checkbox, detail
-- modal, API) and does not rely on an open browser or a scheduled worker.
-- =============================================================================

ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS recurrence TEXT NOT NULL DEFAULT 'none'
    CHECK (recurrence IN ('none', 'monthly')),
  ADD COLUMN IF NOT EXISTS recurrence_source_id UUID
    REFERENCES public.todos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.todos.recurrence IS
  'Task recurrence cadence. Monthly creates the next task only on completion.';
COMMENT ON COLUMN public.todos.recurrence_source_id IS
  'The first task in a recurring task series.';

CREATE INDEX IF NOT EXISTS todos_recurrence_source_idx
  ON public.todos(recurrence_source_id)
  WHERE recurrence = 'monthly';

CREATE OR REPLACE FUNCTION public.create_next_monthly_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_next_task_id UUID;
  v_next_due_date DATE;
BEGIN
  -- A task only advances once: when it first transitions into done.
  IF NEW.recurrence <> 'monthly'
     OR NEW.status <> 'done'
     OR OLD.status = 'done' THEN
    RETURN NEW;
  END IF;

  -- `date + interval '1 month'` preserves the day where possible and safely
  -- maps dates such as 31 January to the last day of February.
  v_next_due_date := (COALESCE(NEW.due_date, CURRENT_DATE) + INTERVAL '1 month')::DATE;

  INSERT INTO public.todos (
    organization_id, workspace_id, created_by, updated_by,
    title, description, status, priority, due_date, deal_id,
    recurrence, recurrence_source_id
  ) VALUES (
    NEW.organization_id, NEW.workspace_id,
    COALESCE(NEW.updated_by, NEW.created_by), COALESCE(NEW.updated_by, NEW.created_by),
    NEW.title, NEW.description, 'todo', NEW.priority, v_next_due_date, NEW.deal_id,
    'monthly', COALESCE(NEW.recurrence_source_id, NEW.id)
  )
  RETURNING id INTO v_next_task_id;

  -- Keep assignees on the next occurrence, as this is the same recurring work.
  INSERT INTO public.task_assignees (task_id, user_id, assigned_by)
  SELECT v_next_task_id, user_id, COALESCE(NEW.updated_by, NEW.created_by)
  FROM public.task_assignees
  WHERE task_id = NEW.id
  ON CONFLICT (task_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS todos_create_next_monthly_task ON public.todos;
CREATE TRIGGER todos_create_next_monthly_task
  AFTER UPDATE ON public.todos
  FOR EACH ROW
  EXECUTE FUNCTION public.create_next_monthly_task();
