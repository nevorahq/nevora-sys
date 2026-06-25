-- ============================================================
-- Migration 008: CRM Module
-- ============================================================
-- Порядок создания (зависимости сверху вниз):
--   crm_pipelines → crm_pipeline_stages
--   crm_clients → crm_contacts
--   crm_deals (ссылается на pipeline_stages + clients)
--   crm_activities (полиморфные — client | contact | deal)
--   crm_notes    (полиморфные — client | contact | deal)
--   crm_tags + crm_entity_tags
--
-- Все таблицы: organization_id + RLS + индексы + updated_at триггер.
-- Полиморфные связи: entity_type + entity_id (без FK — гибкость).
-- ============================================================


-- ============================================================
-- 1. CRM_PIPELINES
-- ============================================================
-- Воронка продаж. У организации может быть несколько воронок
-- (основная, партнёрская, enterprise...).
-- is_default: одна воронка по умолчанию — для быстрого старта.

CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  is_default      BOOLEAN     NOT NULL DEFAULT false,
  created_by      UUID                   REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.crm_pipelines IS 'Sales pipelines. Each org can have multiple pipelines.';

CREATE INDEX IF NOT EXISTS crm_pipelines_org_idx ON public.crm_pipelines(organization_id);

DROP TRIGGER IF EXISTS crm_pipelines_updated_at ON public.crm_pipelines;
CREATE TRIGGER crm_pipelines_updated_at
  BEFORE UPDATE ON public.crm_pipelines
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 2. CRM_PIPELINE_STAGES
-- ============================================================
-- Этапы внутри воронки. Упорядочены по position.
--
-- stage_type: open | won | lost
--   open — обычный этап (Новый лид, Переговоры, КП отправлено...)
--   won  — системный этап "Выиграно" (один на воронку)
--   lost — системный этап "Проиграно" (один на воронку)
--
-- probability: 0–100. Для прогнозирования выручки (weighted pipeline).

CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id     UUID        NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  position        INT         NOT NULL DEFAULT 0,
  probability     INT         NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  color           TEXT        NOT NULL DEFAULT '#6366f1',
  stage_type      TEXT        NOT NULL DEFAULT 'open'
                    CHECK (stage_type IN ('open', 'won', 'lost')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.crm_pipeline_stages IS 'Ordered stages within a pipeline. stage_type=won/lost are terminal stages.';

CREATE INDEX IF NOT EXISTS crm_pipeline_stages_pipeline_idx
  ON public.crm_pipeline_stages(pipeline_id, position);
CREATE INDEX IF NOT EXISTS crm_pipeline_stages_org_idx
  ON public.crm_pipeline_stages(organization_id);

DROP TRIGGER IF EXISTS crm_pipeline_stages_updated_at ON public.crm_pipeline_stages;
CREATE TRIGGER crm_pipeline_stages_updated_at
  BEFORE UPDATE ON public.crm_pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 3. CRM_CLIENTS
-- ============================================================
-- Клиент = компания или физическое лицо.
--
-- client_type: company | individual
-- status: lead → prospect → customer → churned
--   lead      — входящий / холодный
--   prospect  — квалифицирован, идут переговоры
--   customer  — активный клиент (есть хотя бы одна закрытая сделка)
--   churned   — ушёл
--
-- source: откуда пришёл клиент (для маркетинговой аналитики).

CREATE TABLE IF NOT EXISTS public.crm_clients (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id    UUID                   REFERENCES public.workspaces(id)  ON DELETE SET NULL,
  name            TEXT        NOT NULL,
  email           TEXT,
  phone           TEXT,
  website         TEXT,
  company         TEXT,
  client_type     TEXT        NOT NULL DEFAULT 'company'
                    CHECK (client_type IN ('company', 'individual')),
  status          TEXT        NOT NULL DEFAULT 'lead'
                    CHECK (status IN ('lead', 'prospect', 'customer', 'churned')),
  source          TEXT        NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual', 'import', 'api', 'form', 'referral')),
  description     TEXT,
  assigned_to     UUID                   REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by      UUID                   REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by      UUID                   REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

COMMENT ON TABLE public.crm_clients IS 'CRM clients (companies or individuals). Core CRM entity.';

CREATE INDEX IF NOT EXISTS crm_clients_org_idx
  ON public.crm_clients(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_clients_status_idx
  ON public.crm_clients(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_clients_assigned_idx
  ON public.crm_clients(organization_id, assigned_to) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS crm_clients_updated_at ON public.crm_clients;
CREATE TRIGGER crm_clients_updated_at
  BEFORE UPDATE ON public.crm_clients
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 4. CRM_CONTACTS
-- ============================================================
-- Контактное лицо, связанное с клиентом.
-- client_id nullable: контакт может существовать без компании.
-- is_primary: главный контакт клиента (один per client).

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id       UUID                   REFERENCES public.crm_clients(id) ON DELETE SET NULL,
  first_name      TEXT        NOT NULL,
  last_name       TEXT,
  email           TEXT,
  phone           TEXT,
  position        TEXT,
  is_primary      BOOLEAN     NOT NULL DEFAULT false,
  created_by      UUID                   REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

COMMENT ON TABLE public.crm_contacts IS 'Contact persons linked to clients. is_primary marks the main contact.';

CREATE INDEX IF NOT EXISTS crm_contacts_org_idx
  ON public.crm_contacts(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_contacts_client_idx
  ON public.crm_contacts(client_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS crm_contacts_updated_at ON public.crm_contacts;
CREATE TRIGGER crm_contacts_updated_at
  BEFORE UPDATE ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 5. CRM_DEALS
-- ============================================================
-- Сделка (opportunity). Движется по этапам воронки.
--
-- value: ожидаемая сумма сделки. NUMERIC(14,2) — не float.
-- status: open | won | lost
--   Отдельное поле от stage — stage_type='won' меняет status.
--   Это позволяет быстро фильтровать без JOIN на stages.
--
-- won_at / lost_at / lost_reason: для аналитики win rate.
-- expected_close_date: для прогноза дашборда.

CREATE TABLE IF NOT EXISTS public.crm_deals (
  id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID           NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id         UUID                      REFERENCES public.workspaces(id)  ON DELETE SET NULL,
  pipeline_id          UUID           NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE RESTRICT,
  stage_id             UUID           NOT NULL REFERENCES public.crm_pipeline_stages(id) ON DELETE RESTRICT,
  client_id            UUID                      REFERENCES public.crm_clients(id) ON DELETE SET NULL,
  title                TEXT           NOT NULL,
  value                NUMERIC(14, 2),
  currency             TEXT           NOT NULL DEFAULT 'USD',
  status               TEXT           NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'won', 'lost')),
  expected_close_date  DATE,
  assigned_to          UUID                      REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by           UUID                      REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by           UUID                      REFERENCES auth.users(id) ON DELETE SET NULL,
  won_at               TIMESTAMPTZ,
  lost_at              TIMESTAMPTZ,
  lost_reason          TEXT,
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ    NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);

COMMENT ON TABLE public.crm_deals IS 'Sales deals moving through pipeline stages. value in NUMERIC for financial accuracy.';

CREATE INDEX IF NOT EXISTS crm_deals_org_idx
  ON public.crm_deals(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_deals_pipeline_stage_idx
  ON public.crm_deals(pipeline_id, stage_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_deals_client_idx
  ON public.crm_deals(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_deals_status_idx
  ON public.crm_deals(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_deals_assigned_idx
  ON public.crm_deals(organization_id, assigned_to) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS crm_deals_updated_at ON public.crm_deals;
CREATE TRIGGER crm_deals_updated_at
  BEFORE UPDATE ON public.crm_deals
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 6. CRM_ACTIVITIES
-- ============================================================
-- Активности (звонок, email, встреча, задача, заметка).
-- Полиморфны: entity_type + entity_id (client | contact | deal).
--
-- scheduled_at: когда запланирована активность.
-- completed_at: когда завершена (NULL = не завершена).

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type     TEXT        NOT NULL CHECK (entity_type IN ('client', 'contact', 'deal')),
  entity_id       UUID        NOT NULL,
  activity_type   TEXT        NOT NULL
                    CHECK (activity_type IN ('call', 'email', 'meeting', 'task', 'note')),
  title           TEXT        NOT NULL,
  description     TEXT,
  scheduled_at    TIMESTAMPTZ,
  completed       BOOLEAN     NOT NULL DEFAULT false,
  completed_at    TIMESTAMPTZ,
  created_by      UUID                   REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.crm_activities IS 'Polymorphic activity log for clients, contacts, and deals.';

CREATE INDEX IF NOT EXISTS crm_activities_org_idx
  ON public.crm_activities(organization_id);
CREATE INDEX IF NOT EXISTS crm_activities_entity_idx
  ON public.crm_activities(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS crm_activities_scheduled_idx
  ON public.crm_activities(organization_id, scheduled_at)
  WHERE completed = false AND scheduled_at IS NOT NULL;

DROP TRIGGER IF EXISTS crm_activities_updated_at ON public.crm_activities;
CREATE TRIGGER crm_activities_updated_at
  BEFORE UPDATE ON public.crm_activities
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 7. CRM_NOTES
-- ============================================================
-- Текстовые заметки к клиенту / контакту / сделке.
-- Отдельная таблица от activities — заметки не имеют типа/даты,
-- это просто free-form текст.

CREATE TABLE IF NOT EXISTS public.crm_notes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type     TEXT        NOT NULL CHECK (entity_type IN ('client', 'contact', 'deal')),
  entity_id       UUID        NOT NULL,
  content         TEXT        NOT NULL CHECK (length(trim(content)) > 0),
  created_by      UUID                   REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

COMMENT ON TABLE public.crm_notes IS 'Free-form notes attached to any CRM entity (client, contact, deal).';

CREATE INDEX IF NOT EXISTS crm_notes_entity_idx
  ON public.crm_notes(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_notes_org_idx
  ON public.crm_notes(organization_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS crm_notes_updated_at ON public.crm_notes;
CREATE TRIGGER crm_notes_updated_at
  BEFORE UPDATE ON public.crm_notes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 8. CRM_TAGS + CRM_ENTITY_TAGS
-- ============================================================
-- Теги для клиентов и сделок.
-- crm_tags: справочник тегов org.
-- crm_entity_tags: junction (tag ↔ entity).

CREATE TABLE IF NOT EXISTS public.crm_tags (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  color           TEXT        NOT NULL DEFAULT '#6366f1',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, name)
);

COMMENT ON TABLE public.crm_tags IS 'Tag dictionary per organization. name is unique within org.';

CREATE INDEX IF NOT EXISTS crm_tags_org_idx ON public.crm_tags(organization_id);

CREATE TABLE IF NOT EXISTS public.crm_entity_tags (
  tag_id      UUID NOT NULL REFERENCES public.crm_tags(id)  ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('client', 'deal')),
  entity_id   UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tag_id, entity_type, entity_id)
);

COMMENT ON TABLE public.crm_entity_tags IS 'Junction: tag ↔ client or deal.';

CREATE INDEX IF NOT EXISTS crm_entity_tags_entity_idx
  ON public.crm_entity_tags(entity_type, entity_id);


-- ============================================================
-- 9. RLS — crm_pipelines
-- ============================================================
ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_pipelines_select" ON public.crm_pipelines;
CREATE POLICY "crm_pipelines_select" ON public.crm_pipelines
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "crm_pipelines_insert" ON public.crm_pipelines;
CREATE POLICY "crm_pipelines_insert" ON public.crm_pipelines
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace(organization_id));

DROP POLICY IF EXISTS "crm_pipelines_update" ON public.crm_pipelines;
CREATE POLICY "crm_pipelines_update" ON public.crm_pipelines
  FOR UPDATE TO authenticated
  USING (public.can_manage_workspace(organization_id))
  WITH CHECK (public.can_manage_workspace(organization_id));

DROP POLICY IF EXISTS "crm_pipelines_delete" ON public.crm_pipelines;
CREATE POLICY "crm_pipelines_delete" ON public.crm_pipelines
  FOR DELETE TO authenticated
  USING (public.can_manage_workspace(organization_id));


-- ============================================================
-- 10. RLS — crm_pipeline_stages
-- ============================================================
ALTER TABLE public.crm_pipeline_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_pipeline_stages_select" ON public.crm_pipeline_stages;
CREATE POLICY "crm_pipeline_stages_select" ON public.crm_pipeline_stages
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "crm_pipeline_stages_insert" ON public.crm_pipeline_stages;
CREATE POLICY "crm_pipeline_stages_insert" ON public.crm_pipeline_stages
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace(organization_id));

DROP POLICY IF EXISTS "crm_pipeline_stages_update" ON public.crm_pipeline_stages;
CREATE POLICY "crm_pipeline_stages_update" ON public.crm_pipeline_stages
  FOR UPDATE TO authenticated
  USING (public.can_manage_workspace(organization_id))
  WITH CHECK (public.can_manage_workspace(organization_id));

DROP POLICY IF EXISTS "crm_pipeline_stages_delete" ON public.crm_pipeline_stages;
CREATE POLICY "crm_pipeline_stages_delete" ON public.crm_pipeline_stages
  FOR DELETE TO authenticated
  USING (public.can_manage_workspace(organization_id));


-- ============================================================
-- 11. RLS — crm_clients
-- ============================================================
ALTER TABLE public.crm_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_clients_select" ON public.crm_clients;
CREATE POLICY "crm_clients_select" ON public.crm_clients
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "crm_clients_insert" ON public.crm_clients;
CREATE POLICY "crm_clients_insert" ON public.crm_clients
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "crm_clients_update" ON public.crm_clients;
CREATE POLICY "crm_clients_update" ON public.crm_clients
  FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id) AND deleted_at IS NULL)
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "crm_clients_delete" ON public.crm_clients;
CREATE POLICY "crm_clients_delete" ON public.crm_clients
  FOR DELETE TO authenticated
  USING (public.can_delete_data(organization_id));


-- ============================================================
-- 12. RLS — crm_contacts
-- ============================================================
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_contacts_select" ON public.crm_contacts;
CREATE POLICY "crm_contacts_select" ON public.crm_contacts
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "crm_contacts_insert" ON public.crm_contacts;
CREATE POLICY "crm_contacts_insert" ON public.crm_contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "crm_contacts_update" ON public.crm_contacts;
CREATE POLICY "crm_contacts_update" ON public.crm_contacts
  FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id) AND deleted_at IS NULL)
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "crm_contacts_delete" ON public.crm_contacts;
CREATE POLICY "crm_contacts_delete" ON public.crm_contacts
  FOR DELETE TO authenticated
  USING (public.can_delete_data(organization_id));


-- ============================================================
-- 13. RLS — crm_deals
-- ============================================================
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_deals_select" ON public.crm_deals;
CREATE POLICY "crm_deals_select" ON public.crm_deals
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "crm_deals_insert" ON public.crm_deals;
CREATE POLICY "crm_deals_insert" ON public.crm_deals
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "crm_deals_update" ON public.crm_deals;
CREATE POLICY "crm_deals_update" ON public.crm_deals
  FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id) AND deleted_at IS NULL)
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "crm_deals_delete" ON public.crm_deals;
CREATE POLICY "crm_deals_delete" ON public.crm_deals
  FOR DELETE TO authenticated
  USING (public.can_delete_data(organization_id));


-- ============================================================
-- 14. RLS — crm_activities
-- ============================================================
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_activities_select" ON public.crm_activities;
CREATE POLICY "crm_activities_select" ON public.crm_activities
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "crm_activities_insert" ON public.crm_activities;
CREATE POLICY "crm_activities_insert" ON public.crm_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "crm_activities_update" ON public.crm_activities;
CREATE POLICY "crm_activities_update" ON public.crm_activities
  FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id))
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "crm_activities_delete" ON public.crm_activities;
CREATE POLICY "crm_activities_delete" ON public.crm_activities
  FOR DELETE TO authenticated
  USING (public.can_delete_data(organization_id));


-- ============================================================
-- 15. RLS — crm_notes
-- ============================================================
ALTER TABLE public.crm_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_notes_select" ON public.crm_notes;
CREATE POLICY "crm_notes_select" ON public.crm_notes
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "crm_notes_insert" ON public.crm_notes;
CREATE POLICY "crm_notes_insert" ON public.crm_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "crm_notes_update" ON public.crm_notes;
CREATE POLICY "crm_notes_update" ON public.crm_notes
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.can_delete_data(organization_id)
  )
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "crm_notes_delete" ON public.crm_notes;
CREATE POLICY "crm_notes_delete" ON public.crm_notes
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.can_delete_data(organization_id)
  );


-- ============================================================
-- 16. RLS — crm_tags + crm_entity_tags
-- ============================================================
ALTER TABLE public.crm_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_tags_select" ON public.crm_tags;
CREATE POLICY "crm_tags_select" ON public.crm_tags
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "crm_tags_insert" ON public.crm_tags;
CREATE POLICY "crm_tags_insert" ON public.crm_tags
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "crm_tags_delete" ON public.crm_tags;
CREATE POLICY "crm_tags_delete" ON public.crm_tags
  FOR DELETE TO authenticated
  USING (public.can_delete_data(organization_id));

ALTER TABLE public.crm_entity_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_entity_tags_select" ON public.crm_entity_tags;
CREATE POLICY "crm_entity_tags_select" ON public.crm_entity_tags
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_tags t
      WHERE t.id = tag_id
        AND public.is_org_member(t.organization_id)
    )
  );

DROP POLICY IF EXISTS "crm_entity_tags_insert" ON public.crm_entity_tags;
CREATE POLICY "crm_entity_tags_insert" ON public.crm_entity_tags
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_tags t
      WHERE t.id = tag_id
        AND public.can_write_data(t.organization_id)
    )
  );

DROP POLICY IF EXISTS "crm_entity_tags_delete" ON public.crm_entity_tags;
CREATE POLICY "crm_entity_tags_delete" ON public.crm_entity_tags
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_tags t
      WHERE t.id = tag_id
        AND public.can_delete_data(t.organization_id)
    )
  );


-- ============================================================
-- 17. SEED FUNCTION: create_default_crm_pipeline()
-- ============================================================
-- Вызывается при первом входе в CRM (или при создании org).
-- Создаёт default pipeline со стандартными этапами.
-- Идемпотентна: если pipeline уже есть — ничего не делает.

CREATE OR REPLACE FUNCTION public.create_default_crm_pipeline(p_org_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_pipeline_id UUID;
BEGIN
  -- Уже есть default pipeline?
  SELECT id INTO v_pipeline_id
  FROM public.crm_pipelines
  WHERE organization_id = p_org_id AND is_default = true
  LIMIT 1;

  IF v_pipeline_id IS NOT NULL THEN
    RETURN v_pipeline_id;
  END IF;

  -- Создаём pipeline
  INSERT INTO public.crm_pipelines (organization_id, name, is_default)
  VALUES (p_org_id, 'Sales Pipeline', true)
  RETURNING id INTO v_pipeline_id;

  -- Создаём стандартные этапы
  INSERT INTO public.crm_pipeline_stages
    (pipeline_id, organization_id, name, position, probability, color, stage_type)
  VALUES
    (v_pipeline_id, p_org_id, 'New Lead',      0,  10, '#94a3b8', 'open'),
    (v_pipeline_id, p_org_id, 'Qualified',     1,  25, '#60a5fa', 'open'),
    (v_pipeline_id, p_org_id, 'Proposal Sent', 2,  50, '#a78bfa', 'open'),
    (v_pipeline_id, p_org_id, 'Negotiation',   3,  75, '#f59e0b', 'open'),
    (v_pipeline_id, p_org_id, 'Won',            4, 100, '#22c55e', 'won'),
    (v_pipeline_id, p_org_id, 'Lost',           5,   0, '#ef4444', 'lost');

  RETURN v_pipeline_id;
END;
$$;

COMMENT ON FUNCTION public.create_default_crm_pipeline(UUID) IS
  'Idempotent: creates default pipeline + stages for org. Safe to call multiple times.';


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--   AND table_name LIKE 'crm_%'
--   ORDER BY table_name;
--
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename LIKE 'crm_%';
-- ============================================================
