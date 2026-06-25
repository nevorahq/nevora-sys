-- ============================================================
-- Migration 048: Action Center (Phase 3)
-- ============================================================
-- Action Center — orchestration-слой поверх модулей. Нормализует сигналы
-- (overdue task, renewal soon, missing relation, AI suggestion…) в единые
-- action_items, которые приоритизируются и показываются на одном экране.
--
-- НЕ дублирует бизнес-логику модулей: source_type/source_id ссылаются на
-- исходную сущность полиморфно (как entity_links из 040/047).
--
-- 4 таблицы:
--   action_items        — нормализованное действие
--   action_item_links   — связи action item ↔ бизнес-сущности
--   action_item_events  — история изменений (immutable)
--   notifications       — in-app уведомления (MVP)
--
-- Принципы (как в 006/040/047):
--   • organization_id + RLS на каждой таблице
--   • все INSERT/UPDATE-политики с WITH CHECK
--   • created_by = auth.uid() форсируется политикой
--   • event-логи immutable (INSERT only)
--   • writer-роли пишут (can_write_data), без service role
-- ============================================================


-- ============================================================
-- 1. ACTION_ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.action_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id        UUID                 REFERENCES public.workspaces(id) ON DELETE SET NULL,

  title               TEXT        NOT NULL,
  description         TEXT,

  type                TEXT        NOT NULL
                        CHECK (type IN (
                          'approval_required', 'due_soon', 'overdue',
                          'missing_information', 'missing_relation', 'draft_review',
                          'ai_suggestion', 'risk_detected', 'payment_required',
                          'renewal_required', 'assignment_required', 'document_review',
                          'follow_up_required'
                        )),

  status              TEXT        NOT NULL DEFAULT 'open'
                        CHECK (status IN (
                          'open', 'in_progress', 'snoozed',
                          'resolved', 'dismissed', 'cancelled', 'failed'
                        )),

  priority            TEXT        NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('critical', 'high', 'medium', 'low', 'info')),
  priority_score      INTEGER     NOT NULL DEFAULT 0,

  source_type         TEXT        NOT NULL
                        CHECK (source_type IN (
                          'task', 'document', 'transaction', 'subscription',
                          'crm', 'automation', 'ai', 'system'
                        )),
  source_id           UUID        NOT NULL,
  source_event_id     UUID                 REFERENCES public.domain_events(id) ON DELETE SET NULL,

  primary_entity_type TEXT,
  primary_entity_id   UUID,

  due_at              TIMESTAMPTZ,
  snoozed_until       TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  dismissed_at        TIMESTAMPTZ,

  assigned_to         UUID                 REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by          UUID                 REFERENCES auth.users(id) ON DELETE SET NULL,

  ai_generated        BOOLEAN     NOT NULL DEFAULT false,
  ai_confidence       NUMERIC     CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
  ai_reason           TEXT,

  metadata            JSONB       NOT NULL DEFAULT '{}',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

COMMENT ON TABLE public.action_items IS
  'Normalized cross-module action items (Action Center). source_type/source_id reference the originating entity polymorphically.';

-- Идемпотентность генератора: один активный action item на сигнал.
-- Пока строка не удалена — повторная генерация того же сигнала не плодит дубли.
CREATE UNIQUE INDEX IF NOT EXISTS action_items_dedupe_idx
  ON public.action_items (organization_id, type, source_type, source_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS action_items_org_status_idx
  ON public.action_items (organization_id, status);
CREATE INDEX IF NOT EXISTS action_items_org_due_idx
  ON public.action_items (organization_id, due_at);
CREATE INDEX IF NOT EXISTS action_items_org_priority_idx
  ON public.action_items (organization_id, priority_score DESC);
CREATE INDEX IF NOT EXISTS action_items_assigned_to_idx
  ON public.action_items (organization_id, assigned_to);
CREATE INDEX IF NOT EXISTS action_items_org_workspace_idx
  ON public.action_items (organization_id, workspace_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_action_items_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS action_items_set_updated_at ON public.action_items;
CREATE TRIGGER action_items_set_updated_at
  BEFORE UPDATE ON public.action_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_action_items_updated_at();


-- ============================================================
-- 2. ACTION_ITEM_LINKS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.action_item_links (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id    UUID                 REFERENCES public.workspaces(id) ON DELETE SET NULL,

  action_item_id  UUID        NOT NULL REFERENCES public.action_items(id) ON DELETE CASCADE,
  entity_type     TEXT        NOT NULL,
  entity_id       UUID        NOT NULL,
  relation_type   TEXT        NOT NULL DEFAULT 'related'
                    CHECK (relation_type IN ('primary', 'related', 'suggested', 'source', 'result')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT action_item_links_unique
    UNIQUE (action_item_id, entity_type, entity_id, relation_type)
);

CREATE INDEX IF NOT EXISTS action_item_links_action_idx
  ON public.action_item_links (action_item_id);
CREATE INDEX IF NOT EXISTS action_item_links_entity_idx
  ON public.action_item_links (organization_id, entity_type, entity_id);


-- ============================================================
-- 3. ACTION_ITEM_EVENTS  (immutable history)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.action_item_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id    UUID                 REFERENCES public.workspaces(id) ON DELETE SET NULL,

  action_item_id  UUID        NOT NULL REFERENCES public.action_items(id) ON DELETE CASCADE,

  event_name      TEXT        NOT NULL,
  old_status      TEXT,
  new_status      TEXT,

  payload         JSONB       NOT NULL DEFAULT '{}',
  created_by      UUID                 REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS action_item_events_item_idx
  ON public.action_item_events (action_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS action_item_events_org_idx
  ON public.action_item_events (organization_id, created_at DESC);


-- ============================================================
-- 4. NOTIFICATIONS  (MVP in-app)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id    UUID                 REFERENCES public.workspaces(id) ON DELETE SET NULL,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  type            TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  body            TEXT,
  action_item_id  UUID                 REFERENCES public.action_items(id) ON DELETE CASCADE,

  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON public.notifications (user_id, read_at);
CREATE INDEX IF NOT EXISTS notifications_org_idx
  ON public.notifications (organization_id, created_at DESC);


-- ============================================================
-- 5. RLS
-- ============================================================

-- ── action_items ──────────────────────────────────────────
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "action_items_select" ON public.action_items;
CREATE POLICY "action_items_select"
  ON public.action_items FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "action_items_insert" ON public.action_items;
CREATE POLICY "action_items_insert"
  ON public.action_items FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "action_items_update" ON public.action_items;
CREATE POLICY "action_items_update"
  ON public.action_items FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id) AND deleted_at IS NULL)
  WITH CHECK (public.can_write_data(organization_id));

-- ── action_item_links ─────────────────────────────────────
ALTER TABLE public.action_item_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "action_item_links_select" ON public.action_item_links;
CREATE POLICY "action_item_links_select"
  ON public.action_item_links FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "action_item_links_insert" ON public.action_item_links;
CREATE POLICY "action_item_links_insert"
  ON public.action_item_links FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
  );

DROP POLICY IF EXISTS "action_item_links_delete" ON public.action_item_links;
CREATE POLICY "action_item_links_delete"
  ON public.action_item_links FOR DELETE TO authenticated
  USING (public.is_org_member(organization_id) AND public.can_write_data(organization_id));

-- ── action_item_events (immutable: INSERT + SELECT only) ───
ALTER TABLE public.action_item_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "action_item_events_select" ON public.action_item_events;
CREATE POLICY "action_item_events_select"
  ON public.action_item_events FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "action_item_events_insert" ON public.action_item_events;
CREATE POLICY "action_item_events_insert"
  ON public.action_item_events FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
    AND created_by = auth.uid()
  );

-- ── notifications (own rows) ──────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select"
  ON public.notifications FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) AND user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
  );

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname='public'
--   AND tablename IN ('action_items','action_item_links','action_item_events','notifications');
-- ============================================================
