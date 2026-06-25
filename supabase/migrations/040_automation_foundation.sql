-- ============================================================
-- Migration 040: Automation Foundation (Phase 1)
-- ============================================================
-- Фундамент для автоматизации бизнес-процессов между модулями.
--
-- Добавляет два слоя поверх уже существующего domain_events (006):
--
--   1. entity_links          — универсальные связи между сущностями
--                              разных модулей (task ↔ document ↔ transaction…)
--
--   2. automation_audit_logs — журнал ВЫПОЛНЕНИЯ автоматизаций.
--                              Не путать с generic audit_logs (006):
--                              audit_logs            = «пользователь изменил запись»
--                              automation_audit_logs = «автоматизация отработала/упала»
--
-- Принципы (как в 006):
--   • organization_id + RLS на каждой таблице
--   • все INSERT-политики с WITH CHECK
--   • created_by = auth.uid() форсируется политикой (нельзя подделать)
--   • логи immutable: только INSERT, без UPDATE/DELETE (deny by default)
--   • permission на запись/удаление — через существующие role-функции
--     can_write_data() / can_delete_data() из 002_security_functions.sql
-- ============================================================


-- ============================================================
-- 1. ENTITY_LINKS
-- ============================================================
-- Универсальная связь «source-сущность → target-сущность».
-- Полиморфно по type+id, чтобы не плодить join-таблицы на каждую пару
-- модулей. Кросс-tenant связи невозможны: обе стороны живут в одной
-- organization_id, а RLS не даст увидеть/создать чужое.
--
-- link_type — управляемый словарь смысла связи:
--   related | generated_from | attached_to | paid_by
--   renewed_by | requires_action | belongs_to

CREATE TABLE IF NOT EXISTS public.entity_links (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  source_type     TEXT        NOT NULL,
  source_id       UUID        NOT NULL,

  target_type     TEXT        NOT NULL,
  target_id       UUID        NOT NULL,

  link_type       TEXT        NOT NULL DEFAULT 'related'
                    CHECK (link_type IN (
                      'related', 'generated_from', 'attached_to',
                      'paid_by', 'renewed_by', 'requires_action', 'belongs_to'
                    )),

  created_by      UUID                 REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Сущность не может ссылаться сама на себя
  CONSTRAINT entity_links_no_self_link
    CHECK (NOT (source_type = target_type AND source_id = target_id))
);

COMMENT ON TABLE public.entity_links IS
  'Universal cross-module links between entities (task↔document↔transaction…). Org-scoped, immutable (delete+recreate to change).';

COMMENT ON COLUMN public.entity_links.link_type IS
  'Controlled vocabulary of link meaning. See CHECK constraint.';

-- Защита от дублей: одна и та же направленная связь одного типа — один раз
CREATE UNIQUE INDEX IF NOT EXISTS entity_links_unique_idx
  ON public.entity_links (
    organization_id, source_type, source_id,
    target_type, target_id, link_type
  );

-- Поиск «что связано с этой source-сущностью»
CREATE INDEX IF NOT EXISTS entity_links_source_idx
  ON public.entity_links (organization_id, source_type, source_id);

-- Поиск «что ссылается на эту target-сущность»
CREATE INDEX IF NOT EXISTS entity_links_target_idx
  ON public.entity_links (organization_id, target_type, target_id);

CREATE INDEX IF NOT EXISTS entity_links_created_at_idx
  ON public.entity_links (created_at DESC);


-- ============================================================
-- 2. AUTOMATION_AUDIT_LOGS
-- ============================================================
-- История срабатываний automation-хендлеров.
-- Создаётся движком dispatchDomainEvent() для каждого matched-хендлера.
--
-- status:
--   created  — лог заведён до запуска (зарезервировано под async-очереди)
--   executed — хендлер успешно отработал
--   failed   — хендлер бросил ошибку (error_message обязателен по смыслу)
--   skipped  — хендлер осознанно ничего не сделал (нет условий для действия)
--
-- trigger_event_id связывает лог с domain_events.id, который его породил.

CREATE TABLE IF NOT EXISTS public.automation_audit_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id     UUID                 REFERENCES public.workspaces(id) ON DELETE SET NULL,

  automation_name  TEXT        NOT NULL,
  automation_event TEXT        NOT NULL,

  trigger_event_id UUID                 REFERENCES public.domain_events(id) ON DELETE SET NULL,

  status           TEXT        NOT NULL
                     CHECK (status IN ('created', 'executed', 'failed', 'skipped')),

  input_payload    JSONB       NOT NULL DEFAULT '{}',
  output_payload   JSONB       NOT NULL DEFAULT '{}',
  error_message    TEXT,

  created_by       UUID                 REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.automation_audit_logs IS
  'Execution log of automation handlers. Immutable: INSERT only. trigger_event_id → domain_events.id.';

COMMENT ON COLUMN public.automation_audit_logs.status IS
  'created | executed | failed | skipped — see CHECK constraint.';

CREATE INDEX IF NOT EXISTS automation_audit_logs_org_id_idx
  ON public.automation_audit_logs (organization_id);

CREATE INDEX IF NOT EXISTS automation_audit_logs_workspace_id_idx
  ON public.automation_audit_logs (workspace_id);

CREATE INDEX IF NOT EXISTS automation_audit_logs_trigger_event_id_idx
  ON public.automation_audit_logs (trigger_event_id);

CREATE INDEX IF NOT EXISTS automation_audit_logs_status_idx
  ON public.automation_audit_logs (organization_id, status);

CREATE INDEX IF NOT EXISTS automation_audit_logs_created_at_idx
  ON public.automation_audit_logs (organization_id, created_at DESC);


-- ============================================================
-- 3. RLS — entity_links
-- ============================================================
-- SELECT : члены org видят связи своей org
-- INSERT : активный writer, created_by = auth.uid(), нельзя подделать org
-- DELETE : manager+ (can_delete_data), только внутри своей org
-- UPDATE : нет политики → запрещено (связь меняется через delete+create)

ALTER TABLE public.entity_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_links_select" ON public.entity_links;
CREATE POLICY "entity_links_select"
  ON public.entity_links
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "entity_links_insert" ON public.entity_links;
CREATE POLICY "entity_links_insert"
  ON public.entity_links
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "entity_links_delete" ON public.entity_links;
CREATE POLICY "entity_links_delete"
  ON public.entity_links
  FOR DELETE
  TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND public.can_delete_data(organization_id)
  );


-- ============================================================
-- 4. RLS — automation_audit_logs
-- ============================================================
-- SELECT : члены org видят логи автоматизаций своей org
-- INSERT : активный член org, created_by = auth.uid() (движок пишет от
--          имени пользователя, инициировавшего исходное действие)
-- UPDATE/DELETE : нет политик → запрещено (immutable)

ALTER TABLE public.automation_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_audit_logs_select" ON public.automation_audit_logs;
CREATE POLICY "automation_audit_logs_select"
  ON public.automation_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "automation_audit_logs_insert" ON public.automation_audit_logs;
CREATE POLICY "automation_audit_logs_insert"
  ON public.automation_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND created_by = auth.uid()
  );


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public'
--   AND tablename IN ('entity_links', 'automation_audit_logs');
--
-- SELECT polname, cmd FROM pg_policies
--   WHERE schemaname = 'public'
--   AND tablename IN ('entity_links', 'automation_audit_logs');
-- ============================================================
