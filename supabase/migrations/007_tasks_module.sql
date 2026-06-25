-- ============================================================
-- Migration 007: Tasks Module — расширение todos + новые таблицы
-- ============================================================
-- Что делаем:
--   1. Добавляем status + position в todos (расширяем модель)
--   2. Синхронизируем is_completed ↔ status через триггер
--   3. Создаём task_assignees (many-to-many: task ↔ user)
--   4. Создаём task_comments
--   5. Создаём task_relations (blocks / relates_to / duplicates)
--   6. RLS на всех новых таблицах
--
-- Таблицу todos НЕ переименовываем — живые данные, нет причин.
-- is_completed остаётся для backward-совместимости с UI,
-- но источником правды становится status.
-- ============================================================


-- ============================================================
-- 1. РАСШИРЯЕМ ТАБЛИЦУ todos
-- ============================================================

-- status: жизненный цикл задачи.
-- Значения расположены в порядке прохождения по воронке.
-- 'cancelled' — не удаление, а отмена (данные сохраняются).
ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'in_review', 'done', 'cancelled'));

COMMENT ON COLUMN public.todos.status IS
  'Task lifecycle status. Source of truth. Synced to is_completed via trigger.';

-- position: для ручной сортировки внутри статуса (Kanban, drag-and-drop).
-- Используем BIGINT чтобы не перенумеровывать при вставке между позициями.
ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS position BIGINT;

COMMENT ON COLUMN public.todos.position IS
  'Manual sort order within status column. NULL = auto-ordered by created_at.';

-- Индексы под новые паттерны
CREATE INDEX IF NOT EXISTS todos_status_org_idx
  ON public.todos(organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS todos_position_idx
  ON public.todos(organization_id, status, position NULLS LAST)
  WHERE deleted_at IS NULL;


-- ============================================================
-- 2. СИНХРОНИЗАЦИЯ status ↔ is_completed
-- ============================================================
-- Логика:
--   status → 'done'       : is_completed = true
--   status → всё остальное: is_completed = false
--   is_completed → true   : status = 'done' (если был 'todo'/'in_progress')
--   is_completed → false  : status = 'todo'  (если был 'done')
--
-- Это нужно пока features/todos UI использует is_completed напрямую.
-- После полного перехода на status — триггер можно убрать.

CREATE OR REPLACE FUNCTION public.sync_task_status_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- status изменился → синхронизируем is_completed
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.is_completed := (NEW.status = 'done');
  -- is_completed изменился → синхронизируем status
  ELSIF NEW.is_completed IS DISTINCT FROM OLD.is_completed THEN
    IF NEW.is_completed AND OLD.status NOT IN ('done', 'cancelled') THEN
      NEW.status := 'done';
    ELSIF NOT NEW.is_completed AND OLD.status = 'done' THEN
      NEW.status := 'todo';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS todos_sync_status_completed ON public.todos;
CREATE TRIGGER todos_sync_status_completed
  BEFORE UPDATE ON public.todos
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_task_status_completed();

-- Backfill: синхронизируем status для существующих записей
UPDATE public.todos
SET status = CASE WHEN is_completed THEN 'done' ELSE 'todo' END
WHERE status = 'todo' AND is_completed = true;


-- ============================================================
-- 3. TASK_ASSIGNEES
-- ============================================================
-- Одна задача может быть назначена нескольким пользователям.
-- Пользователь должен быть active членом той же org.
--
-- assigned_by: кто назначил (для audit trail).
-- UNIQUE(task_id, user_id): один user — одно назначение на задачу.

CREATE TABLE IF NOT EXISTS public.task_assignees (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID        NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  assigned_by UUID                    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id)
);

COMMENT ON TABLE public.task_assignees IS
  'Many-to-many: task ↔ user assignees. User must be active org member (enforced by app layer).';

CREATE INDEX IF NOT EXISTS task_assignees_task_idx
  ON public.task_assignees(task_id);

CREATE INDEX IF NOT EXISTS task_assignees_user_idx
  ON public.task_assignees(user_id);


-- ============================================================
-- 4. TASK_COMMENTS
-- ============================================================
-- Комментарии к задаче.
-- Soft delete через deleted_at — история не удаляется физически.
-- edited_at: NULL если не редактировался, иначе время последней правки.

CREATE TABLE IF NOT EXISTS public.task_comments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID        NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  content         TEXT        NOT NULL CHECK (length(trim(content)) > 0),
  edited_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.task_comments IS
  'Comments on tasks. Soft-deleted. edited_at tracks content edits.';

CREATE INDEX IF NOT EXISTS task_comments_task_idx
  ON public.task_comments(task_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS task_comments_org_idx
  ON public.task_comments(organization_id);

DROP TRIGGER IF EXISTS task_comments_updated_at ON public.task_comments;
CREATE TRIGGER task_comments_updated_at
  BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 5. TASK_RELATIONS
-- ============================================================
-- Связи между задачами.
--
-- relation_type:
--   'blocks'      — task_id блокирует related_task_id
--   'blocked_by'  — task_id заблокирован related_task_id (обратная)
--   'relates_to'  — общая связь без семантики блокировки
--   'duplicates'  — task_id является дубликатом related_task_id
--
-- При создании 'blocks' — зеркальная 'blocked_by' создаётся автоматически
-- через триггер (иначе запрос "задачи, которые меня блокируют" стал бы
-- дорогим OR запросом).
--
-- Запрет самосвязи: CHECK (task_id != related_task_id).
-- UNIQUE(task_id, related_task_id, relation_type): нет дублей.

CREATE TABLE IF NOT EXISTS public.task_relations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID        NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  related_task_id  UUID        NOT NULL REFERENCES public.todos(id) ON DELETE CASCADE,
  relation_type    TEXT        NOT NULL
                     CHECK (relation_type IN ('blocks', 'blocked_by', 'relates_to', 'duplicates')),
  created_by       UUID                   REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, related_task_id, relation_type),
  CHECK (task_id != related_task_id)
);

COMMENT ON TABLE public.task_relations IS
  'Directed relations between tasks. blocks/blocked_by are created as mirrors automatically.';

CREATE INDEX IF NOT EXISTS task_relations_task_idx
  ON public.task_relations(task_id);

CREATE INDEX IF NOT EXISTS task_relations_related_idx
  ON public.task_relations(related_task_id);

-- Триггер: при создании 'blocks' — автоматически создаём 'blocked_by'
CREATE OR REPLACE FUNCTION public.mirror_task_relation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  mirror_type TEXT;
BEGIN
  IF NEW.relation_type = 'blocks' THEN
    mirror_type := 'blocked_by';
  ELSIF NEW.relation_type = 'blocked_by' THEN
    mirror_type := 'blocks';
  ELSE
    RETURN NEW; -- 'relates_to' и 'duplicates' симметричны, зеркало создаётся в app layer
  END IF;

  INSERT INTO public.task_relations (task_id, related_task_id, relation_type, created_by)
  VALUES (NEW.related_task_id, NEW.task_id, mirror_type, NEW.created_by)
  ON CONFLICT (task_id, related_task_id, relation_type) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_relations_mirror ON public.task_relations;
CREATE TRIGGER task_relations_mirror
  AFTER INSERT ON public.task_relations
  FOR EACH ROW
  EXECUTE FUNCTION public.mirror_task_relation();


-- ============================================================
-- 6. RLS — task_assignees
-- ============================================================
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

-- SELECT через org задачи: member видит, кто назначен на задачи его org
DROP POLICY IF EXISTS "task_assignees_select" ON public.task_assignees;
CREATE POLICY "task_assignees_select"
  ON public.task_assignees FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.todos t
      WHERE t.id = task_id
        AND public.is_org_member(t.organization_id)
    )
  );

-- INSERT: manager+ может назначать исполнителей
DROP POLICY IF EXISTS "task_assignees_insert" ON public.task_assignees;
CREATE POLICY "task_assignees_insert"
  ON public.task_assignees FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.todos t
      WHERE t.id = task_id
        AND public.can_write_data(t.organization_id)
    )
  );

-- DELETE: manager+ или сам пользователь снимает себя
DROP POLICY IF EXISTS "task_assignees_delete" ON public.task_assignees;
CREATE POLICY "task_assignees_delete"
  ON public.task_assignees FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.todos t
      WHERE t.id = task_id
        AND public.can_delete_data(t.organization_id)
    )
  );


-- ============================================================
-- 7. RLS — task_comments
-- ============================================================
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_comments_select" ON public.task_comments;
CREATE POLICY "task_comments_select"
  ON public.task_comments FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "task_comments_insert" ON public.task_comments;
CREATE POLICY "task_comments_insert"
  ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND user_id = auth.uid()
  );

-- UPDATE: только автор может редактировать свой комментарий
DROP POLICY IF EXISTS "task_comments_update" ON public.task_comments;
CREATE POLICY "task_comments_update"
  ON public.task_comments FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_org_member(organization_id)
    AND deleted_at IS NULL
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_org_member(organization_id)
  );

-- DELETE (soft): автор или manager+
DROP POLICY IF EXISTS "task_comments_delete" ON public.task_comments;
CREATE POLICY "task_comments_delete"
  ON public.task_comments FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_delete_data(organization_id)
  );


-- ============================================================
-- 8. RLS — task_relations
-- ============================================================
ALTER TABLE public.task_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_relations_select" ON public.task_relations;
CREATE POLICY "task_relations_select"
  ON public.task_relations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.todos t
      WHERE t.id = task_id
        AND public.is_org_member(t.organization_id)
    )
  );

DROP POLICY IF EXISTS "task_relations_insert" ON public.task_relations;
CREATE POLICY "task_relations_insert"
  ON public.task_relations FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.todos t
      WHERE t.id = task_id
        AND public.can_write_data(t.organization_id)
    )
  );

DROP POLICY IF EXISTS "task_relations_delete" ON public.task_relations;
CREATE POLICY "task_relations_delete"
  ON public.task_relations FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.todos t
      WHERE t.id = task_id
        AND public.can_delete_data(t.organization_id)
    )
  );


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'todos' AND column_name IN ('status', 'position');
--
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--   AND table_name IN ('task_assignees', 'task_comments', 'task_relations');
--
-- SELECT count(*) FROM todos WHERE status IS NULL; -- 0
-- ============================================================
