-- ============================================================
-- Migration 056: Multiple task assignees + task-scoped access + activity
-- ============================================================
-- Цели:
--   1. Many-to-many task_assignees сохраняется (UNIQUE(task_id,user_id)).
--   2. created_by автоматически становится первым assignee (триггер + backfill).
--   3. Доступ к задаче и связанным сущностям сужается до:
--        - создателя (created_by);
--        - назначенных assignees;
--        - owner/admin/manager организации.
--      Обычный member без назначения НЕ видит чужую задачу.
--   4. Никаких рекурсивных RLS-проверок между todos и task_assignees:
--      доступ вычисляется через SECURITY DEFINER функцию can_access_task(),
--      которая читает обе таблицы под ролью-владельцем (RLS не применяется).
--   5. Нельзя оставить задачу без ответственных: удаление идёт через
--      транзакционную RPC remove_task_assignee() (FOR UPDATE lock), а прямой
--      DELETE на task_assignees запрещён (нет политики).
--   6. Activity-история читается через get_task_activity() — только по
--      конкретной задаче и только при наличии доступа.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. SECURITY DEFINER хелперы доступа
-- ============================================================
-- Все читают todos / task_assignees / memberships под ролью-владельцем,
-- поэтому RLS на этих таблицах не срабатывает → нет рекурсии при
-- использовании внутри RLS-политик todos и task_assignees.

-- Может ли текущий пользователь ВИДЕТЬ задачу.
CREATE OR REPLACE FUNCTION public.can_access_task(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.todos t
    WHERE t.id = p_task_id
      AND public.is_org_member(t.organization_id)
      AND (
        -- создатель сохраняет доступ как автор
        t.created_by = auth.uid()
        -- управляющие роли организации
        OR EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.user_id = auth.uid()
            AND m.organization_id = t.organization_id
            AND m.status = 'active'
            AND m.role IN ('owner', 'admin', 'manager')
        )
        -- назначенный исполнитель
        OR EXISTS (
          SELECT 1 FROM public.task_assignees ta
          WHERE ta.task_id = t.id
            AND ta.user_id = auth.uid()
        )
      )
  );
$$;

COMMENT ON FUNCTION public.can_access_task(UUID) IS
  'View access to a task: creator OR assignee OR owner/admin/manager of the task org. '
  'SECURITY DEFINER so it can be used in todos/task_assignees RLS without recursion.';

-- Может ли текущий пользователь УПРАВЛЯТЬ ответственными задачи
-- (добавлять/снимать других): создатель ИЛИ owner/admin/manager.
CREATE OR REPLACE FUNCTION public.can_manage_task(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.todos t
    WHERE t.id = p_task_id
      AND public.is_org_member(t.organization_id)
      AND (
        t.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.user_id = auth.uid()
            AND m.organization_id = t.organization_id
            AND m.status = 'active'
            AND m.role IN ('owner', 'admin', 'manager')
        )
      )
  );
$$;

COMMENT ON FUNCTION public.can_manage_task(UUID) IS
  'Manage assignees of a task: creator OR owner/admin/manager of the task org.';

-- Можно ли назначить p_user_id на задачу: инициатор управляет задачей,
-- а цель — активный член той же организации (нельзя invited/suspended/чужого).
CREATE OR REPLACE FUNCTION public.can_assign_user_to_task(p_task_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT public.can_manage_task(p_task_id)
    AND EXISTS (
      SELECT 1
      FROM public.todos t
      JOIN public.memberships m ON m.organization_id = t.organization_id
      WHERE t.id = p_task_id
        AND m.user_id = p_user_id
        AND m.status = 'active'
    );
$$;

COMMENT ON FUNCTION public.can_assign_user_to_task(UUID, UUID) IS
  'True if caller can manage the task AND the target user is an active member of the task org.';

-- Доступ к документу: член org, и для task-документов — доступ к самой задаче.
CREATE OR REPLACE FUNCTION public.can_access_document(p_document_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.documents d
    WHERE d.id = p_document_id
      AND public.is_org_member(d.organization_id)
      AND (
        d.entity_type IS DISTINCT FROM 'task'
        OR public.can_access_task(d.entity_id)
      )
  );
$$;

COMMENT ON FUNCTION public.can_access_document(UUID) IS
  'Document access: org member; task-linked documents additionally require can_access_task.';


-- ============================================================
-- 2. Автодобавление создателя в assignees
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_creator_as_assignee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.organization_id = NEW.organization_id
      AND m.user_id = NEW.created_by
      AND m.status = 'active'
  ) THEN
    INSERT INTO public.task_assignees (task_id, user_id, assigned_by)
    VALUES (NEW.id, NEW.created_by, NEW.created_by)
    ON CONFLICT (task_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.add_creator_as_assignee() IS
  'AFTER INSERT trigger on todos: makes created_by the first assignee (assigned_by = created_by).';

DROP TRIGGER IF EXISTS todos_add_creator_assignee ON public.todos;
CREATE TRIGGER todos_add_creator_assignee
  AFTER INSERT ON public.todos
  FOR EACH ROW
  EXECUTE FUNCTION public.add_creator_as_assignee();


-- ============================================================
-- 3. Backfill: задачи без ответственных получают создателя
-- ============================================================
-- Не трогаем задачи, у которых уже есть assignees.
INSERT INTO public.task_assignees (task_id, user_id, assigned_by)
SELECT t.id, t.created_by, t.created_by
FROM public.todos t
JOIN public.memberships m
  ON m.organization_id = t.organization_id
 AND m.user_id = t.created_by
 AND m.status = 'active'
WHERE t.created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = t.id
  )
ON CONFLICT (task_id, user_id) DO NOTHING;


-- ============================================================
-- 4. Транзакционное снятие ответственного
-- ============================================================
-- Гарантирует, что параллельные снятия не оставят задачу без assignees:
-- FOR UPDATE блокирует строки ответственных задачи на время проверки.
CREATE OR REPLACE FUNCTION public.remove_task_assignee(p_task_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor      UUID := auth.uid();
  v_org        UUID;
  v_total      INT;
  v_is_assignee BOOLEAN;
  v_deleted    INT;
BEGIN
  SELECT organization_id INTO v_org
  FROM public.todos
  WHERE id = p_task_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF NOT public.can_access_task(p_task_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Снять можно: себя (любой assignee) ИЛИ другого — при праве управления.
  IF p_user_id <> v_actor AND NOT public.can_manage_task(p_task_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Сериализуем параллельные снятия по этой задаче.
  PERFORM 1 FROM public.task_assignees WHERE task_id = p_task_id FOR UPDATE;

  SELECT count(*) INTO v_total FROM public.task_assignees WHERE task_id = p_task_id;
  SELECT EXISTS (
    SELECT 1 FROM public.task_assignees
    WHERE task_id = p_task_id AND user_id = p_user_id
  ) INTO v_is_assignee;

  IF NOT v_is_assignee THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_assignee');
  END IF;

  IF v_total <= 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'last_assignee');
  END IF;

  DELETE FROM public.task_assignees
  WHERE task_id = p_task_id AND user_id = p_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    -- Состав ответственных влияет на Last updated задачи.
    UPDATE public.todos
    SET updated_by = v_actor
    WHERE id = p_task_id;
  END IF;

  RETURN jsonb_build_object('ok', v_deleted > 0, 'deleted', v_deleted);
END;
$$;

COMMENT ON FUNCTION public.remove_task_assignee(UUID, UUID) IS
  'Transactional assignee removal. Enforces access, self/manage rules and the '
  'never-leave-a-task-without-assignees invariant via FOR UPDATE locking.';


-- ============================================================
-- 5. Activity истории задачи (audit_logs, task-scoped)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_task_activity(
  p_task_id UUID,
  p_limit   INT DEFAULT 50,
  p_offset  INT DEFAULT 0
)
RETURNS SETOF public.audit_logs
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT public.can_access_task(p_task_id) THEN
    RAISE EXCEPTION 'forbidden' USING errcode = '42501';
  END IF;

  RETURN QUERY
    SELECT *
    FROM public.audit_logs
    WHERE entity_type = 'todos'
      AND entity_id = p_task_id
    ORDER BY created_at DESC
    LIMIT  GREATEST(p_limit, 0)
    OFFSET GREATEST(p_offset, 0);
END;
$$;

COMMENT ON FUNCTION public.get_task_activity(UUID, INT, INT) IS
  'Returns audit_logs for a single task, newest first, only if caller can access it. '
  'Never exposes the org-wide audit log.';


-- ============================================================
-- 6. RLS — todos (доступ через can_access_task)
-- ============================================================
DROP POLICY IF EXISTS "todos_org_select" ON public.todos;
CREATE POLICY "todos_org_select"
  ON public.todos FOR SELECT TO authenticated
  USING (public.can_access_task(id));

-- INSERT без изменений: любой пишущий член org (createdBy станет assignee триггером).
DROP POLICY IF EXISTS "todos_org_insert" ON public.todos;
CREATE POLICY "todos_org_insert"
  ON public.todos FOR INSERT TO authenticated
  WITH CHECK (public.can_write_data(organization_id));

-- UPDATE (вкл. soft-delete): доступ к задаче + право записи.
DROP POLICY IF EXISTS "todos_org_update" ON public.todos;
CREATE POLICY "todos_org_update"
  ON public.todos FOR UPDATE TO authenticated
  USING (public.can_access_task(id) AND public.can_write_data(organization_id))
  WITH CHECK (public.can_access_task(id) AND public.can_write_data(organization_id));

-- DELETE (hard): manager+ (как раньше).
DROP POLICY IF EXISTS "todos_org_delete" ON public.todos;
CREATE POLICY "todos_org_delete"
  ON public.todos FOR DELETE TO authenticated
  USING (public.can_delete_data(organization_id));


-- ============================================================
-- 7. RLS — task_assignees (без рекурсии, без прямого DELETE)
-- ============================================================
DROP POLICY IF EXISTS "task_assignees_select" ON public.task_assignees;
CREATE POLICY "task_assignees_select"
  ON public.task_assignees FOR SELECT TO authenticated
  USING (public.can_access_task(task_id));

DROP POLICY IF EXISTS "task_assignees_insert" ON public.task_assignees;
CREATE POLICY "task_assignees_insert"
  ON public.task_assignees FOR INSERT TO authenticated
  WITH CHECK (
    public.can_assign_user_to_task(task_id, user_id)
    AND assigned_by = auth.uid()
  );

-- DELETE: политики нет → прямой DELETE запрещён. Снятие только через
-- remove_task_assignee() (SECURITY DEFINER), которая держит инвариант.
DROP POLICY IF EXISTS "task_assignees_delete" ON public.task_assignees;


-- ============================================================
-- 8. RLS — task_comments
-- ============================================================
DROP POLICY IF EXISTS "task_comments_select" ON public.task_comments;
CREATE POLICY "task_comments_select"
  ON public.task_comments FOR SELECT TO authenticated
  USING (public.can_access_task(task_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "task_comments_insert" ON public.task_comments;
CREATE POLICY "task_comments_insert"
  ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (public.can_access_task(task_id) AND user_id = auth.uid());

DROP POLICY IF EXISTS "task_comments_update" ON public.task_comments;
CREATE POLICY "task_comments_update"
  ON public.task_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.can_access_task(task_id) AND deleted_at IS NULL)
  WITH CHECK (user_id = auth.uid() AND public.can_access_task(task_id));

DROP POLICY IF EXISTS "task_comments_delete" ON public.task_comments;
CREATE POLICY "task_comments_delete"
  ON public.task_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_task(task_id));


-- ============================================================
-- 9. RLS — task_relations
-- ============================================================
DROP POLICY IF EXISTS "task_relations_select" ON public.task_relations;
CREATE POLICY "task_relations_select"
  ON public.task_relations FOR SELECT TO authenticated
  USING (public.can_access_task(task_id));

DROP POLICY IF EXISTS "task_relations_insert" ON public.task_relations;
CREATE POLICY "task_relations_insert"
  ON public.task_relations FOR INSERT TO authenticated
  WITH CHECK (public.can_access_task(task_id));

DROP POLICY IF EXISTS "task_relations_delete" ON public.task_relations;
CREATE POLICY "task_relations_delete"
  ON public.task_relations FOR DELETE TO authenticated
  USING (public.can_access_task(task_id));


-- ============================================================
-- 10. RLS — documents / document_attachments (task-scoped)
-- ============================================================
DROP POLICY IF EXISTS "documents_select" ON public.documents;
CREATE POLICY "documents_select"
  ON public.documents FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND deleted_at IS NULL
    AND (entity_type IS DISTINCT FROM 'task' OR public.can_access_task(entity_id))
  );

DROP POLICY IF EXISTS "documents_insert" ON public.documents;
CREATE POLICY "documents_insert"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND (entity_type IS DISTINCT FROM 'task' OR public.can_access_task(entity_id))
  );

DROP POLICY IF EXISTS "documents_update" ON public.documents;
CREATE POLICY "documents_update"
  ON public.documents FOR UPDATE TO authenticated
  USING (
    public.can_write_data(organization_id)
    AND deleted_at IS NULL
    AND (entity_type IS DISTINCT FROM 'task' OR public.can_access_task(entity_id))
  )
  WITH CHECK (
    public.can_write_data(organization_id)
    AND (entity_type IS DISTINCT FROM 'task' OR public.can_access_task(entity_id))
  );

DROP POLICY IF EXISTS "document_versions_select" ON public.document_versions;
CREATE POLICY "document_versions_select"
  ON public.document_versions FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND public.can_access_document(document_id)
  );

DROP POLICY IF EXISTS "document_attachments_select" ON public.document_attachments;
CREATE POLICY "document_attachments_select"
  ON public.document_attachments FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND public.can_access_document(document_id)
  );

DROP POLICY IF EXISTS "document_attachments_insert" ON public.document_attachments;
CREATE POLICY "document_attachments_insert"
  ON public.document_attachments FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND public.can_access_document(document_id)
  );

DROP POLICY IF EXISTS "document_attachments_delete" ON public.document_attachments;
CREATE POLICY "document_attachments_delete"
  ON public.document_attachments FOR DELETE TO authenticated
  USING (
    public.can_delete_data(organization_id)
    AND public.can_access_document(document_id)
  );

DROP POLICY IF EXISTS "document_links_select" ON public.document_links;
CREATE POLICY "document_links_select"
  ON public.document_links FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND public.can_access_document(document_id)
  );

DROP POLICY IF EXISTS "document_links_insert" ON public.document_links;
CREATE POLICY "document_links_insert"
  ON public.document_links FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND public.can_access_document(document_id)
  );

DROP POLICY IF EXISTS "document_links_delete" ON public.document_links;
CREATE POLICY "document_links_delete"
  ON public.document_links FOR DELETE TO authenticated
  USING (
    public.can_delete_data(organization_id)
    AND public.can_access_document(document_id)
  );

DROP POLICY IF EXISTS "document_comments_select" ON public.document_comments;
CREATE POLICY "document_comments_select"
  ON public.document_comments FOR SELECT TO authenticated
  USING (public.can_access_document(document_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "document_comments_insert" ON public.document_comments;
CREATE POLICY "document_comments_insert"
  ON public.document_comments FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND public.can_access_document(document_id)
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "document_comments_update" ON public.document_comments;
CREATE POLICY "document_comments_update"
  ON public.document_comments FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.can_access_document(document_id)
    AND deleted_at IS NULL
  )
  WITH CHECK (user_id = auth.uid() AND public.can_access_document(document_id));

DROP POLICY IF EXISTS "document_comments_delete" ON public.document_comments;
CREATE POLICY "document_comments_delete"
  ON public.document_comments FOR DELETE TO authenticated
  USING (
    public.can_access_document(document_id)
    AND (user_id = auth.uid() OR public.can_delete_data(organization_id))
  );

-- Storage должен наследовать task-scoped доступ документа, иначе файл можно
-- было бы скачать напрямую по object path, минуя document_attachments RLS.
DROP POLICY IF EXISTS "documents_storage_select" ON storage.objects;
CREATE POLICY "documents_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1
      FROM public.document_attachments a
      WHERE a.storage_bucket = bucket_id
        AND (a.storage_path = name OR a.file_path = name)
        AND public.can_access_document(a.document_id)
    )
  );


-- ============================================================
-- 11. GRANTS
-- ============================================================
-- RLS-хелперы — оставляем на дефолтном PUBLIC grant (как is_org_member и пр.),
-- иначе вычисление RLS-выражений у authenticated упадёт.

-- RPC из server actions — authenticated-only.
REVOKE ALL ON FUNCTION public.remove_task_assignee(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_task_assignee(UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_task_activity(UUID, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_task_activity(UUID, INT, INT) TO authenticated;

-- Триггерная функция — internal-only (EXECUTE при срабатывании триггера не проверяется).
REVOKE ALL ON FUNCTION public.add_creator_as_assignee() FROM PUBLIC, anon, authenticated;

COMMIT;

-- ============================================================
-- ПРОВЕРКА / Verification (manual):
--   SELECT count(*) FROM public.todos t
--     WHERE t.created_by IS NOT NULL
--       AND NOT EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = t.id);
--   -- 0  (каждая задача с автором имеет ≥1 ответственного)
-- ============================================================
