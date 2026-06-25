-- ============================================================
-- Migration 006: Event Layer + Audit Logs
-- ============================================================
-- Создаём два фундаментальных слоя:
--
-- 1. domain_events — бизнес-события (task.created, deal.won...)
--    Используются для: Analytics, AI context, Automation, Reporting
--
-- 2. audit_logs — лог критичных действий пользователей
--    Используются для: безопасности, compliance, debugging, undo
--
-- Оба слоя: organization_id + RLS + индексы.
-- Записи только INSERT — никогда UPDATE/DELETE (immutable log).
-- ============================================================


-- ============================================================
-- 1. DOMAIN_EVENTS
-- ============================================================
-- Каждое важное бизнес-действие порождает событие.
-- Event-sourcing light: не полный event sourcing, но достаточно
-- для analytics, AI и automation.
--
-- event_name: формат "aggregate.action" (task.created, deal.won)
-- aggregate_type: тип сущности (task, deal, client, payment...)
-- aggregate_id: UUID сущности
-- workspace_id: nullable — не все события workspace-scoped
-- payload: JSONB — гибкий контекст события без миграций схемы
-- version: для future-proofing при изменении структуры payload

CREATE TABLE IF NOT EXISTS public.domain_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID       NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id   UUID                   REFERENCES public.workspaces(id)  ON DELETE SET NULL,
  event_name     TEXT        NOT NULL,
  aggregate_type TEXT        NOT NULL,
  aggregate_id   UUID        NOT NULL,
  payload        JSONB       NOT NULL DEFAULT '{}',
  created_by     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  version        INT         NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.domain_events IS
  'Immutable business event log. Used for analytics, AI context, automation, reporting.';

COMMENT ON COLUMN public.domain_events.event_name IS
  'Format: aggregate.action — e.g. task.created, deal.won, payment.received';

COMMENT ON COLUMN public.domain_events.payload IS
  'Flexible JSONB context. Include relevant snapshot data at time of event.';

-- Индексы под основные паттерны запросов
CREATE INDEX IF NOT EXISTS domain_events_org_id_idx
  ON public.domain_events(organization_id);

CREATE INDEX IF NOT EXISTS domain_events_org_created_idx
  ON public.domain_events(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS domain_events_aggregate_idx
  ON public.domain_events(aggregate_type, aggregate_id);

CREATE INDEX IF NOT EXISTS domain_events_event_name_idx
  ON public.domain_events(organization_id, event_name);

-- Для AI/Analytics: все события по org за период
CREATE INDEX IF NOT EXISTS domain_events_org_name_date_idx
  ON public.domain_events(organization_id, event_name, created_at DESC);


-- ============================================================
-- 2. AUDIT_LOGS
-- ============================================================
-- Кто, когда, что сделал с какой записью.
-- Отличие от domain_events:
--   domain_events — бизнес-семантика ("сделка выиграна")
--   audit_logs    — технический факт ("запись обновлена пользователем X")
--
-- entity_type: имя таблицы (todos, subscriptions, memberships...)
-- action: create | update | delete | restore | assign |
--         role_change | permission_change | status_change |
--         stage_change | billing_change
-- old_data/new_data: JSONB снапшот ДО и ПОСЛЕ изменения
--   NULL для create (нет old_data) и delete (нет new_data)
-- ip_address: опционально — для security audit

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type     TEXT        NOT NULL,
  entity_id       UUID        NOT NULL,
  action          TEXT        NOT NULL
                    CHECK (action IN (
                      'create', 'update', 'delete', 'restore',
                      'assign', 'unassign',
                      'role_change', 'permission_change',
                      'status_change', 'stage_change',
                      'billing_change', 'invite', 'suspend'
                    )),
  old_data        JSONB,
  new_data        JSONB,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_logs IS
  'Immutable audit trail for critical user actions. Never UPDATE or DELETE rows.';

COMMENT ON COLUMN public.audit_logs.entity_type IS
  'Table name of the affected entity: todos, memberships, subscriptions, etc.';

COMMENT ON COLUMN public.audit_logs.action IS
  'What was done. Controlled vocabulary — see CHECK constraint.';

COMMENT ON COLUMN public.audit_logs.metadata IS
  'Extra context: ip_address, user_agent, source (api|dashboard|automation), etc.';

-- Индексы
CREATE INDEX IF NOT EXISTS audit_logs_org_id_idx
  ON public.audit_logs(organization_id);

CREATE INDEX IF NOT EXISTS audit_logs_org_created_idx
  ON public.audit_logs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON public.audit_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS audit_logs_user_idx
  ON public.audit_logs(organization_id, user_id, created_at DESC);


-- ============================================================
-- 3. RLS — domain_events
-- ============================================================
-- SELECT: члены org видят события своей org
-- INSERT: любой активный член org может создать событие
-- UPDATE/DELETE: запрещено — лог immutable

ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "domain_events_select" ON public.domain_events;
CREATE POLICY "domain_events_select"
  ON public.domain_events
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "domain_events_insert" ON public.domain_events;
CREATE POLICY "domain_events_insert"
  ON public.domain_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND created_by = auth.uid()
  );

-- UPDATE/DELETE — нет политик → запрещено для всех (deny by default)


-- ============================================================
-- 4. RLS — audit_logs
-- ============================================================
-- SELECT: только admin+ видит полный audit log
-- INSERT: любой активный член (действия записываются от имени user)
-- UPDATE/DELETE: запрещено

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    -- Пользователь видит свои собственные действия
    user_id = auth.uid()
    -- Или admin+ видит весь лог организации
    OR public.is_org_admin(organization_id)
  );

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND user_id = auth.uid()
  );

-- UPDATE/DELETE — нет политик → запрещено


-- ============================================================
-- 5. HELPER FUNCTION: emit_domain_event()
-- ============================================================
-- Удобная DB-функция для записи событий из Server Actions.
-- Вызывается через supabase.rpc('emit_domain_event', {...})
--
-- SECURITY DEFINER не нужен — RLS на INSERT уже настроен правильно.
-- Функция просто делает INSERT с проверкой через RLS.

CREATE OR REPLACE FUNCTION public.emit_domain_event(
  p_organization_id UUID,
  p_event_name      TEXT,
  p_aggregate_type  TEXT,
  p_aggregate_id    UUID,
  p_payload         JSONB    DEFAULT '{}',
  p_workspace_id    UUID     DEFAULT NULL,
  p_version         INT      DEFAULT 1
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO public.domain_events (
    organization_id,
    workspace_id,
    event_name,
    aggregate_type,
    aggregate_id,
    payload,
    created_by,
    version
  )
  VALUES (
    p_organization_id,
    p_workspace_id,
    p_event_name,
    p_aggregate_type,
    p_aggregate_id,
    p_payload,
    auth.uid(),
    p_version
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.emit_domain_event IS
  'Insert a domain event. Called from Server Actions after successful business operations.';


-- ============================================================
-- 6. HELPER FUNCTION: emit_audit_log()
-- ============================================================

CREATE OR REPLACE FUNCTION public.emit_audit_log(
  p_organization_id UUID,
  p_entity_type     TEXT,
  p_entity_id       UUID,
  p_action          TEXT,
  p_old_data        JSONB    DEFAULT NULL,
  p_new_data        JSONB    DEFAULT NULL,
  p_metadata        JSONB    DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    entity_type,
    entity_id,
    action,
    old_data,
    new_data,
    metadata
  )
  VALUES (
    p_organization_id,
    auth.uid(),
    p_entity_type,
    p_entity_id,
    p_action,
    p_old_data,
    p_new_data,
    p_metadata
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION public.emit_audit_log IS
  'Insert an audit log entry. Called from Server Actions for critical mutations.';


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--   AND table_name IN ('domain_events', 'audit_logs');
--
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public'
--   AND tablename IN ('domain_events', 'audit_logs');
-- ============================================================
