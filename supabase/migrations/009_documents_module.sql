-- ============================================================
-- Migration 009: Documents Module
-- ============================================================
-- Таблицы:
--   documents          — основная сущность документа
--   document_versions  — история версий (snapshot при публикации)
--   document_attachments — файлы (refs на Supabase Storage)
--   document_links     — внешние ссылки (Google Docs, Notion...)
--   document_comments  — комментарии к документу
--
-- Полиморфная привязка к бизнес-сущностям через entity_type + entity_id:
--   client | deal | task | workspace
-- Это позволяет документу принадлежать любой сущности без FK на каждую таблицу.
--
-- content хранится как TEXT (Markdown-совместимый) —
-- простой формат, читаемый AI без парсинга.
-- ============================================================


-- ============================================================
-- 1. DOCUMENTS
-- ============================================================
-- doc_type: семантика документа (контракт, отчёт, шаблон...).
-- status:   draft → published → archived.
--   draft     — редактируется, не виден другим (если нужна приватность)
--   published — активный документ
--   archived  — устарел, скрыт из основных списков
--
-- entity_type/entity_id: nullable — документ может быть standalone
-- или привязан к клиенту, сделке, задаче, workspace.

CREATE TABLE IF NOT EXISTS public.documents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id    UUID                   REFERENCES public.workspaces(id)  ON DELETE SET NULL,
  title           TEXT        NOT NULL CHECK (length(trim(title)) > 0),
  content         TEXT        NOT NULL DEFAULT '',
  doc_type        TEXT        NOT NULL DEFAULT 'note'
                    CHECK (doc_type IN ('note', 'template', 'contract', 'report', 'sop', 'other')),
  status          TEXT        NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published', 'archived')),
  entity_type     TEXT                   CHECK (entity_type IN ('client', 'deal', 'task', 'workspace')),
  entity_id       UUID,
  created_by      UUID                   REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by      UUID                   REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  -- entity_type и entity_id должны быть заданы вместе или оба NULL
  CONSTRAINT entity_link_consistent CHECK (
    (entity_type IS NULL AND entity_id IS NULL)
    OR (entity_type IS NOT NULL AND entity_id IS NOT NULL)
  )
);

COMMENT ON TABLE public.documents IS
  'Documents with optional polymorphic link to any business entity.';
COMMENT ON COLUMN public.documents.content IS
  'Markdown text. AI-readable without parsing. Snapshotted in document_versions on publish.';

CREATE INDEX IF NOT EXISTS documents_org_idx
  ON public.documents(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS documents_status_idx
  ON public.documents(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS documents_entity_idx
  ON public.documents(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS documents_workspace_idx
  ON public.documents(workspace_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS documents_updated_at ON public.documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 2. DOCUMENT_VERSIONS
-- ============================================================
-- Snapshot при каждой публикации (не при каждом save).
-- version_number: монотонно растёт на уровне документа.
-- title + content: снапшот на момент публикации.

CREATE TABLE IF NOT EXISTS public.document_versions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version_number  INT         NOT NULL,
  title           TEXT        NOT NULL,
  content         TEXT        NOT NULL DEFAULT '',
  created_by      UUID                   REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, version_number)
);

COMMENT ON TABLE public.document_versions IS
  'Immutable version snapshots. Created on publish. Never updated.';

CREATE INDEX IF NOT EXISTS document_versions_doc_idx
  ON public.document_versions(document_id, version_number DESC);
CREATE INDEX IF NOT EXISTS document_versions_org_idx
  ON public.document_versions(organization_id);


-- ============================================================
-- 3. DOCUMENT_ATTACHMENTS
-- ============================================================
-- Ссылки на файлы в Supabase Storage.
-- file_path: путь в bucket (org_id/doc_id/filename).
-- Реальный upload делается client-side через Supabase Storage SDK;
-- после upload — этот INSERT фиксирует метаданные.

CREATE TABLE IF NOT EXISTS public.document_attachments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_name       TEXT        NOT NULL,
  file_path       TEXT        NOT NULL,
  file_size       BIGINT,
  mime_type       TEXT,
  created_by      UUID                   REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.document_attachments IS
  'File attachment metadata. file_path references Supabase Storage bucket path.';

CREATE INDEX IF NOT EXISTS document_attachments_doc_idx
  ON public.document_attachments(document_id);
CREATE INDEX IF NOT EXISTS document_attachments_org_idx
  ON public.document_attachments(organization_id);


-- ============================================================
-- 4. DOCUMENT_LINKS
-- ============================================================
-- Внешние ссылки: Google Docs, Notion, Figma, GitHub, произвольный URL.

CREATE TABLE IF NOT EXISTS public.document_links (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  url             TEXT        NOT NULL CHECK (url ~* '^https?://'),
  link_type       TEXT        NOT NULL DEFAULT 'other'
                    CHECK (link_type IN ('google_docs', 'notion', 'figma', 'github', 'loom', 'other')),
  created_by      UUID                   REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.document_links IS
  'External URL references attached to a document.';

CREATE INDEX IF NOT EXISTS document_links_doc_idx
  ON public.document_links(document_id);


-- ============================================================
-- 5. DOCUMENT_COMMENTS
-- ============================================================
-- Комментарии к документу. Soft delete.
-- edited_at: NULL если не редактировался.

CREATE TABLE IF NOT EXISTS public.document_comments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  content         TEXT        NOT NULL CHECK (length(trim(content)) > 0),
  edited_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.document_comments IS 'Comments on documents. Soft-deleted.';

CREATE INDEX IF NOT EXISTS document_comments_doc_idx
  ON public.document_comments(document_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS document_comments_org_idx
  ON public.document_comments(organization_id);

DROP TRIGGER IF EXISTS document_comments_updated_at ON public.document_comments;
CREATE TRIGGER document_comments_updated_at
  BEFORE UPDATE ON public.document_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 6. TRIGGER: auto-snapshot on publish
-- ============================================================
-- При смене status → 'published' автоматически создаём version snapshot.
-- version_number = max(existing) + 1, или 1 если первая публикация.

CREATE OR REPLACE FUNCTION public.snapshot_document_on_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_next_version INT;
BEGIN
  -- Только если status меняется на 'published'
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
    SELECT COALESCE(MAX(version_number), 0) + 1
      INTO v_next_version
      FROM public.document_versions
      WHERE document_id = NEW.id;

    INSERT INTO public.document_versions (
      document_id, organization_id, version_number, title, content, created_by
    ) VALUES (
      NEW.id, NEW.organization_id, v_next_version, NEW.title, NEW.content, NEW.updated_by
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_snapshot_on_publish ON public.documents;
CREATE TRIGGER documents_snapshot_on_publish
  AFTER UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_document_on_publish();


-- ============================================================
-- 7. RLS — documents
-- ============================================================
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documents_select" ON public.documents;
CREATE POLICY "documents_select" ON public.documents
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "documents_insert" ON public.documents;
CREATE POLICY "documents_insert" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "documents_update" ON public.documents;
CREATE POLICY "documents_update" ON public.documents
  FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id) AND deleted_at IS NULL)
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "documents_delete" ON public.documents;
CREATE POLICY "documents_delete" ON public.documents
  FOR DELETE TO authenticated
  USING (public.can_delete_data(organization_id));


-- ============================================================
-- 8. RLS — document_versions (read-only, immutable)
-- ============================================================
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_versions_select" ON public.document_versions;
CREATE POLICY "document_versions_select" ON public.document_versions
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- INSERT только через триггер (SECURITY DEFINER не нужен — триггер выполняется
-- с правами владельца функции). Прямой INSERT из app запрещён:
-- нет INSERT политики → deny by default.


-- ============================================================
-- 9. RLS — document_attachments
-- ============================================================
ALTER TABLE public.document_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_attachments_select" ON public.document_attachments;
CREATE POLICY "document_attachments_select" ON public.document_attachments
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "document_attachments_insert" ON public.document_attachments;
CREATE POLICY "document_attachments_insert" ON public.document_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "document_attachments_delete" ON public.document_attachments;
CREATE POLICY "document_attachments_delete" ON public.document_attachments
  FOR DELETE TO authenticated
  USING (public.can_delete_data(organization_id));


-- ============================================================
-- 10. RLS — document_links
-- ============================================================
ALTER TABLE public.document_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_links_select" ON public.document_links;
CREATE POLICY "document_links_select" ON public.document_links
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "document_links_insert" ON public.document_links;
CREATE POLICY "document_links_insert" ON public.document_links
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "document_links_delete" ON public.document_links;
CREATE POLICY "document_links_delete" ON public.document_links
  FOR DELETE TO authenticated
  USING (public.can_delete_data(organization_id));


-- ============================================================
-- 11. RLS — document_comments
-- ============================================================
ALTER TABLE public.document_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_comments_select" ON public.document_comments;
CREATE POLICY "document_comments_select" ON public.document_comments
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) AND deleted_at IS NULL);

DROP POLICY IF EXISTS "document_comments_insert" ON public.document_comments;
CREATE POLICY "document_comments_insert" ON public.document_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "document_comments_update" ON public.document_comments;
CREATE POLICY "document_comments_update" ON public.document_comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "document_comments_delete" ON public.document_comments;
CREATE POLICY "document_comments_delete" ON public.document_comments
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_delete_data(organization_id)
  );


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name LIKE 'document%'
--   ORDER BY table_name;
--
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename LIKE 'document%';
-- ============================================================
