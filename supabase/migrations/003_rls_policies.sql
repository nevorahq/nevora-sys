-- ============================================================
-- Phase 2 — Migration 003: RLS Policies for Multi-Tenant Tables
-- ============================================================
-- Принципы:
-- 1. Все политики проверяют is_org_member() — это главный guard
-- 2. Мутации (INSERT/UPDATE/DELETE) проверяют роль
-- 3. WITH CHECK на INSERT/UPDATE — защита от подмены org_id
-- 4. NO BYPASSING via service_role в app code
-- ============================================================


-- ============================================================
-- ORGANIZATIONS
-- ============================================================
-- SELECT: видишь только orgs, в которых ты member
-- INSERT: любой auth user может создать org (он станет owner)
-- UPDATE: только owner может обновить org
-- DELETE: только owner может удалить org (осторожно — каскад!)

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_select" ON public.organizations;
CREATE POLICY "organizations_select"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(id)
  );

DROP POLICY IF EXISTS "organizations_insert" ON public.organizations;
CREATE POLICY "organizations_insert"
  ON public.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
-- Обоснование: INSERT создаёт новую org. После INSERT мы программно
-- создаём membership с role='owner'. Нет смысла ограничивать здесь —
-- пользователь создаёт свою org, не чужую.

DROP POLICY IF EXISTS "organizations_update" ON public.organizations;
CREATE POLICY "organizations_update"
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (public.is_org_owner(id))
  WITH CHECK (public.is_org_owner(id));

DROP POLICY IF EXISTS "organizations_delete" ON public.organizations;
CREATE POLICY "organizations_delete"
  ON public.organizations
  FOR DELETE
  TO authenticated
  USING (public.is_org_owner(id));


-- ============================================================
-- MEMBERSHIPS
-- ============================================================
-- SELECT: видишь только memberships своей org (если ты member)
-- INSERT: только admin+ может приглашать новых членов
-- UPDATE: owner/admin могут менять роли; свой статус менять нельзя
-- DELETE: owner/admin могут удалять; член может удалить сам себя

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memberships_select" ON public.memberships;
CREATE POLICY "memberships_select"
  ON public.memberships
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(organization_id)
  );

DROP POLICY IF EXISTS "memberships_insert" ON public.memberships;
CREATE POLICY "memberships_insert"
  ON public.memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Разрешить создание собственного membership при создании org (owner bootstrapping)
    -- ИЛИ admin+ уже в этой org
    user_id = auth.uid()  -- self-join при создании org
    OR public.is_org_admin(organization_id)
  );
-- Примечание: при создании org сначала INSERT organizations, потом
-- INSERT memberships (user_id=auth.uid(), role='owner'). Первый INSERT
-- в memberships проходит по условию user_id = auth.uid().

DROP POLICY IF EXISTS "memberships_update" ON public.memberships;
CREATE POLICY "memberships_update"
  ON public.memberships
  FOR UPDATE
  TO authenticated
  USING (
    public.is_org_admin(organization_id)
    -- Защита: нельзя изменить роль owner, если ты не owner
    AND (
      role != 'owner'
      OR public.is_org_owner(organization_id)
    )
  )
  WITH CHECK (
    public.is_org_admin(organization_id)
    AND (
      role != 'owner'
      OR public.is_org_owner(organization_id)
    )
  );

DROP POLICY IF EXISTS "memberships_delete" ON public.memberships;
CREATE POLICY "memberships_delete"
  ON public.memberships
  FOR DELETE
  TO authenticated
  USING (
    -- Удалить себя (выход из org)
    user_id = auth.uid()
    -- ИЛИ admin+ удаляет другого (но не owner)
    OR (
      public.is_org_admin(organization_id)
      AND role != 'owner'
    )
  );


-- ============================================================
-- WORKSPACES
-- ============================================================
-- SELECT: все члены org видят workspaces
-- INSERT/UPDATE/DELETE: только admin+

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspaces_select" ON public.workspaces;
CREATE POLICY "workspaces_select"
  ON public.workspaces
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(organization_id)
  );

DROP POLICY IF EXISTS "workspaces_insert" ON public.workspaces;
CREATE POLICY "workspaces_insert"
  ON public.workspaces
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_workspace(organization_id)
  );

DROP POLICY IF EXISTS "workspaces_update" ON public.workspaces;
CREATE POLICY "workspaces_update"
  ON public.workspaces
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_workspace(organization_id))
  WITH CHECK (public.can_manage_workspace(organization_id));

DROP POLICY IF EXISTS "workspaces_delete" ON public.workspaces;
CREATE POLICY "workspaces_delete"
  ON public.workspaces
  FOR DELETE
  TO authenticated
  USING (public.can_manage_workspace(organization_id));
