-- ============================================================
-- Migration 047: Cross-Module Relations (Phase 2)
-- ============================================================
-- Phase 2 превращает entity_links из «голой» связи в полноценный
-- business-graph слой. Мы НЕ создаём вторую универсальную таблицу
-- (entity_relations) — это плодило бы ровно ту фрагментацию, которую
-- Phase 2 должна устранить, и осиротило бы automation-движок (040),
-- уже завязанный на entity_links. Вместо этого расширяем существующую.
--
-- Добавляем:
--   • workspace_id        — workspace-scope (как у todos/documents)
--   • metadata jsonb      — source/confidence/matched_by для авто-связей и AI
--   • relation_direction  — bidirectional | direct | derived
--   • updated_at          — для будущих мутаций metadata
--   • deleted_at          — SOFT DELETE (раньше был hard delete)
--
-- Меняем:
--   • link_type CHECK     — расширенный словарь Phase-2 (обратно совместимо)
--   • unique-индекс       — становится partial WHERE deleted_at IS NULL,
--                           чтобы можно было пересоздать ранее удалённую связь
--   • SELECT RLS          — скрывает soft-deleted строки
--
-- Добавляем soft_delete_entity_link() (SECURITY DEFINER), зеркалит
-- soft_delete_document() из 046: PostgREST перепроверяет SELECT-политику
-- после того как строка скрыта deleted_at, поэтому soft-delete идёт
-- через выделенную функцию, а не широкую UPDATE-политику.
-- ============================================================


-- ============================================================
-- 1. НОВЫЕ КОЛОНКИ
-- ============================================================

ALTER TABLE public.entity_links
  ADD COLUMN IF NOT EXISTS workspace_id UUID
    REFERENCES public.workspaces(id) ON DELETE SET NULL;

ALTER TABLE public.entity_links
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.entity_links
  ADD COLUMN IF NOT EXISTS relation_direction TEXT NOT NULL DEFAULT 'bidirectional'
    CHECK (relation_direction IN ('bidirectional', 'direct', 'derived'));

ALTER TABLE public.entity_links
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.entity_links
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.entity_links.metadata IS
  'Automation/AI metadata: { source: manual|auto, confidence: number, matched_by: text[] }.';
COMMENT ON COLUMN public.entity_links.relation_direction IS
  'bidirectional (default) | direct | derived. See CHECK constraint.';
COMMENT ON COLUMN public.entity_links.deleted_at IS
  'Soft-delete timestamp. Active relations have deleted_at IS NULL.';


-- ============================================================
-- 2. РАСШИРЕНИЕ СЛОВАРЯ link_type (обратно совместимо)
-- ============================================================
-- Старые значения сохраняются; добавляем Phase-2 relation types.

ALTER TABLE public.entity_links
  DROP CONSTRAINT IF EXISTS entity_links_link_type_check;

ALTER TABLE public.entity_links
  ADD CONSTRAINT entity_links_link_type_check
  CHECK (link_type IN (
    -- наследие 040
    'related', 'generated_from', 'attached_to',
    'paid_by', 'renewed_by', 'requires_action', 'belongs_to',
    -- Phase-2 business vocabulary
    'related_to', 'documented_by', 'requires_action_task',
    'belongs_to_subscription', 'invoice_for_transaction',
    'contract_for_subscription', 'renewal_task'
  ));


-- ============================================================
-- 3. updated_at TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.touch_entity_links_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entity_links_set_updated_at ON public.entity_links;
CREATE TRIGGER entity_links_set_updated_at
  BEFORE UPDATE ON public.entity_links
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_entity_links_updated_at();


-- ============================================================
-- 4. ИНДЕКСЫ
-- ============================================================
-- Старый unique-индекс был безусловным → после удаления связи нельзя
-- было создать такую же заново. Делаем его partial по активным строкам.

DROP INDEX IF EXISTS public.entity_links_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS entity_links_unique_active_idx
  ON public.entity_links (
    organization_id, source_type, source_id,
    target_type, target_id, link_type
  )
  WHERE deleted_at IS NULL;

-- Lookup-индексы (source/target уже есть из 040). Добавляем недостающие.
CREATE INDEX IF NOT EXISTS entity_links_org_id_idx
  ON public.entity_links (organization_id);

CREATE INDEX IF NOT EXISTS entity_links_workspace_id_idx
  ON public.entity_links (workspace_id);

CREATE INDEX IF NOT EXISTS entity_links_link_type_idx
  ON public.entity_links (organization_id, link_type);

CREATE INDEX IF NOT EXISTS entity_links_org_created_at_idx
  ON public.entity_links (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS entity_links_org_deleted_at_idx
  ON public.entity_links (organization_id, deleted_at);


-- ============================================================
-- 5. RLS — скрываем soft-deleted строки на SELECT
-- ============================================================
-- INSERT/DELETE-политики из 040 сохраняются. DELETE-политика остаётся
-- (hard delete всё ещё доступен manager+, но приложение использует
-- soft delete через RPC ниже). SELECT теперь требует deleted_at IS NULL.

DROP POLICY IF EXISTS "entity_links_select" ON public.entity_links;
CREATE POLICY "entity_links_select"
  ON public.entity_links
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND deleted_at IS NULL
  );


-- ============================================================
-- 6. SOFT DELETE RPC
-- ============================================================
-- Зеркалит soft_delete_document() (046). manager+ (can_delete_data),
-- строго внутри своей org, только активную связь.

CREATE OR REPLACE FUNCTION public.soft_delete_entity_link(
  p_link_id UUID,
  p_organization_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_link_id UUID;
BEGIN
  IF NOT public.can_delete_data(p_organization_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.entity_links
  SET deleted_at = now()
  WHERE id = p_link_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL
  RETURNING id INTO v_link_id;

  IF v_link_id IS NULL THEN
    RAISE EXCEPTION 'entity_link_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_link_id;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_entity_link(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_entity_link(UUID, UUID) TO authenticated;


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'entity_links'
--   AND column_name IN ('workspace_id','metadata','relation_direction','updated_at','deleted_at');
--
-- SELECT indexname FROM pg_indexes
--   WHERE tablename = 'entity_links';
-- ============================================================
