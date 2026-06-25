-- ============================================================
-- Migration 031: Reconcile public.todos schema drift (user_id)
-- ============================================================
-- Контекст / Context:
--   Живая БД (production) была изменена вручную (Supabase SQL editor),
--   но эти изменения не попали в migrations/. Verified against the LIVE
--   database (PostgREST column probe, project uimpykbnatzhykzpastd):
--     • workspace_id / created_by / updated_by / deleted_at — EXIST in live.
--       → добавлены в 004 (там, где todos стали org-scoped), т.к. 007
--         уже строит частичные индексы WHERE deleted_at IS NULL и без них
--         падает раньше, чем дошёл бы до 031.
--     • user_id — DROPPED in live (probe → 42703 undefined_column),
--       но 000 создаёт его NOT NULL + 4 RLS-политики + 3 индекса, а 004
--       НЕ удаляет осиротевшие политики 000. Снимаем здесь.
--
--   Эта миграция: (1) добавляет вспомогательные индексы под новые колонки,
--   (2) удаляет user_id вместе с зависимостями из 000. Полностью идемпотентна
--   — на живой БД (user_id уже нет) шаги секции 2 превращаются в no-op.
-- ============================================================

-- ============================================================
-- 1. ИНДЕКСЫ под колонки из 004 / Supporting indexes
-- ============================================================
-- Колонки уже созданы в 004; здесь — FK- и soft-delete-aware индексы
-- (idempotent). 007 уже покрывает (organization_id, status) частично.

CREATE INDEX IF NOT EXISTS idx_todos_workspace_id
  ON public.todos(workspace_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_todos_created_by
  ON public.todos(created_by);

-- Matches the getTasks() access pattern: org + active rows.
CREATE INDEX IF NOT EXISTS idx_todos_org_active
  ON public.todos(organization_id) WHERE deleted_at IS NULL;

-- ============================================================
-- 2. РЕКОНСИЛИЯ user_id / Reconcile dropped user_id column
-- ============================================================
-- Живая БД больше не имеет todos.user_id (модель стала org-scoped в 004).
-- 000 создаёт user_id NOT NULL + 4 RLS-политики + 3 индекса по нему,
-- которые 004 НЕ удаляет (имена "Users can ... own todos" не входят в
-- список DROP в 004). Сначала снимаем зависимости, затем колонку.
-- На живой БД (user_id уже нет) все шаги — no-op.

-- 2a. Осиротевшие политики из 000 (ссылаются на user_id)
DROP POLICY IF EXISTS "Users can view own todos"   ON public.todos;
DROP POLICY IF EXISTS "Users can create own todos" ON public.todos;
DROP POLICY IF EXISTS "Users can update own todos" ON public.todos;
DROP POLICY IF EXISTS "Users can delete own todos" ON public.todos;

-- 2b. Индексы из 000 по user_id (DROP COLUMN снёс бы их каскадно, но
--     удаляем явно для прозрачности и идемпотентности)
DROP INDEX IF EXISTS public.idx_todos_user_id;
DROP INDEX IF EXISTS public.idx_todos_user_completed;
DROP INDEX IF EXISTS public.idx_todos_user_created;

-- 2c. Сама колонка
ALTER TABLE public.todos
  DROP COLUMN IF EXISTS user_id;

-- ============================================================
-- ПРОВЕРКА / Verification (run manually after reset):
--   SELECT column_name, is_nullable, data_type
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='todos'
--   ORDER BY ordinal_position;
--   -- expect: workspace_id, created_by, updated_by, deleted_at present;
--   --         user_id absent.
-- ============================================================
