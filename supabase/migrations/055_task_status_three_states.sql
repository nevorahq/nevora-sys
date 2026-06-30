-- ============================================================
-- Migration 055: Tasks — three-state lifecycle (todo / in_progress / done)
-- ============================================================
-- Контекст / Context:
--   Раньше todos.status допускал 5 значений (todo, in_progress, in_review,
--   done, cancelled). Продукт сводит жизненный цикл задачи к трём состояниям:
--     todo        — «Не определён»  (задача только создана)
--     in_progress — «В процессе»    (работа начата)
--     done        — «Закрыта»       (работа завершена)
--
--   status остаётся единственным источником истины; is_completed зеркалит
--   `done` для обратной совместимости (синхронизируется триггером + явно
--   в changeTaskStatusAction).
--
-- Что делаем:
--   1. Снимаем старый CHECK (5 значений), иначе UPDATE данных упадёт.
--   2. Переносим данные: in_review → in_progress, cancelled → done.
--   3. Ставим новый CHECK только на (todo, in_progress, done).
--   4. Пере-синхронизируем is_completed со status.
--   5. Обновляем триггерную функцию sync_task_status_completed (убираем
--      ссылку на 'cancelled').
--
-- Идемпотентность: DROP CONSTRAINT IF EXISTS + UPDATE ... WHERE делают
-- повторный прогон безопасным.
-- ============================================================

BEGIN;

-- ── 1. Снимаем старый CHECK ─────────────────────────────────
-- Ограничение из 007 создано через ADD COLUMN ... CHECK, имя авто-сгенерировано
-- как todos_status_check.
ALTER TABLE public.todos
  DROP CONSTRAINT IF EXISTS todos_status_check;

-- ── 2. Перенос существующих данных ──────────────────────────
UPDATE public.todos SET status = 'in_progress' WHERE status = 'in_review';
UPDATE public.todos SET status = 'done'        WHERE status = 'cancelled';

-- ── 3. Новый CHECK — только три состояния ───────────────────
ALTER TABLE public.todos
  ADD CONSTRAINT todos_status_check
    CHECK (status IN ('todo', 'in_progress', 'done'));

-- ── 4. Синхронизация is_completed со status ─────────────────
UPDATE public.todos
SET is_completed = (status = 'done')
WHERE is_completed IS DISTINCT FROM (status = 'done');

-- ── 5. Обновляем триггерную функцию ─────────────────────────
-- Убираем ветку с 'cancelled'. Правило прежнее:
--   status → 'done'        : is_completed = true
--   status → todo/in_progress : is_completed = false
--   is_completed → true (если был не 'done') : status = 'done'
--   is_completed → false (если был 'done')   : status = 'todo'
CREATE OR REPLACE FUNCTION public.sync_task_status_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.is_completed := (NEW.status = 'done');
  ELSIF NEW.is_completed IS DISTINCT FROM OLD.is_completed THEN
    IF NEW.is_completed AND OLD.status <> 'done' THEN
      NEW.status := 'done';
    ELSIF NOT NEW.is_completed AND OLD.status = 'done' THEN
      NEW.status := 'todo';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

-- ============================================================
-- ПРОВЕРКА / Verification (run manually after reset):
--   SELECT DISTINCT status FROM public.todos;            -- ⊆ {todo,in_progress,done}
--   SELECT count(*) FROM public.todos
--     WHERE is_completed <> (status = 'done');            -- 0
-- ============================================================
