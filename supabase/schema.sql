-- ============================================================
-- TaskFlow MVP — Database Schema
-- ============================================================
-- Порядок выполнения важен: сначала таблицы, потом индексы,
-- потом триггеры, потом RLS.
-- Выполняй этот файл в Supabase SQL Editor целиком.
-- ============================================================


-- ============================================================
-- 1. ТАБЛИЦА: profiles
-- ============================================================
-- Зачем: auth.users — системная таблица Supabase, в неё нельзя
-- добавлять свои колонки. profiles — наша таблица для бизнес-данных
-- пользователя (имя, аватар, настройки).
--
-- id ссылается на auth.users(id) — это FOREIGN KEY.
-- ON DELETE CASCADE: если пользователь удалит аккаунт в Supabase Auth,
-- его профиль автоматически удалится. Без этого остались бы "сироты".

CREATE TABLE public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Комментарий к таблице (появится в Supabase UI как описание)
COMMENT ON TABLE public.profiles IS 'User profiles linked to auth.users';


-- ============================================================
-- 2. ТАБЛИЦА: todos
-- ============================================================
-- Главная бизнес-таблица. Каждая строка — одна задача.
--
-- Решения по колонкам:
--
-- id: UUID, а не serial (1, 2, 3...).
--   Почему: serial предсказуем — злоумышленник может перебирать
--   /api/todos/1, /api/todos/2... UUID невозможно угадать.
--   gen_random_uuid() — встроенная функция PostgreSQL.
--
-- user_id: связь с auth.users. NOT NULL — задача без владельца
--   не имеет смысла. ON DELETE CASCADE — удалил аккаунт → удалились задачи.
--
-- title: TEXT, а не VARCHAR(255).
--   Почему: в PostgreSQL TEXT и VARCHAR одинаково быстры.
--   VARCHAR(255) — наследие MySQL. Лимит длины лучше делать в Zod
--   (application-level validation), а не в БД.
--
-- priority: TEXT с CHECK constraint вместо ENUM.
--   Почему: PostgreSQL ENUM нельзя изменить без миграции
--   (ALTER TYPE ... ADD VALUE). CHECK constraint легко обновить.
--   Trade-off: ENUM даёт автокомплит в некоторых IDE, CHECK — нет.
--
-- is_completed: BOOLEAN, по умолчанию false.
--   Проще чем status ENUM ('todo', 'in_progress', 'done').
--   Для MVP достаточно. Если нужен workflow — меняем на status.
--
-- due_date: DATE (не TIMESTAMPTZ).
--   "Сделать до 15 июня" — дата, не время. Избегаем timezone-проблем.
--   Nullable — не каждая задача имеет дедлайн.

CREATE TABLE public.todos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT DEFAULT '',
  is_completed BOOLEAN NOT NULL DEFAULT false,
  priority     TEXT NOT NULL DEFAULT 'medium'
                 CHECK (priority IN ('low', 'medium', 'high')),
  due_date     DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.todos IS 'User tasks with priority and completion status';


-- ============================================================
-- 3. ИНДЕКСЫ
-- ============================================================
-- Индекс — это "оглавление книги". Без индекса PostgreSQL
-- читает ВСЮ таблицу (Sequential Scan) чтобы найти нужные строки.
-- С индексом — сразу прыгает к нужной странице (Index Scan).
--
-- Правило: создавай индексы на колонках, которые используются в WHERE.
--
-- Наши запросы:
--   WHERE user_id = ?                → индекс на user_id
--   WHERE user_id = ? AND is_completed = ?  → составной индекс
--   WHERE user_id = ? ORDER BY created_at   → индекс с сортировкой

-- Основной индекс: все запросы фильтруют по user_id
CREATE INDEX idx_todos_user_id ON public.todos (user_id);

-- Составной индекс: фильтрация по статусу (active/completed)
-- PostgreSQL использует его для: WHERE user_id = ? AND is_completed = ?
CREATE INDEX idx_todos_user_completed ON public.todos (user_id, is_completed);

-- Индекс для сортировки: ORDER BY created_at DESC (новые первыми)
CREATE INDEX idx_todos_user_created ON public.todos (user_id, created_at DESC);


-- ============================================================
-- 4. ФУНКЦИЯ + ТРИГГЕР: автообновление updated_at
-- ============================================================
-- Зачем: когда ты делаешь UPDATE, поле updated_at должно
-- автоматически обновиться на текущее время.
-- Без триггера — ты должен каждый раз писать:
--   UPDATE todos SET title = ?, updated_at = now() WHERE id = ?
-- С триггером — достаточно:
--   UPDATE todos SET title = ? WHERE id = ?
-- И updated_at обновится сам.
--
-- Аналогия: штамп "Дата изменения" на документе.
-- Триггер — это автоматический штамп, который ставится
-- при каждом редактировании, даже если ты забыл.

-- Функция (переиспользуемая для любой таблицы)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- NEW — это строка ПОСЛЕ обновления
  -- Мы заменяем updated_at на текущее время
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер на таблице todos
-- BEFORE UPDATE — срабатывает ДО записи, чтобы изменить NEW
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.todos
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Триггер на таблице profiles (тот же принцип)
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 5. ФУНКЦИЯ: автосоздание профиля при регистрации
-- ============================================================
-- Зачем: когда пользователь регистрируется через Supabase Auth,
-- запись создаётся в auth.users. Но нам нужен ещё и профиль
-- в public.profiles. Этот триггер делает это автоматически.
--
-- Без триггера: ты должен после регистрации вручную делать
-- INSERT INTO profiles. Забыл? У пользователя нет профиля → баги.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- SECURITY DEFINER — функция выполняется с правами ВЛАДЕЛЬЦА (postgres),
-- а не вызывающего пользователя. Это нужно, потому что обычный
-- пользователь не имеет прав вставлять в profiles напрямую (RLS).

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- 6. RLS POLICIES — Row Level Security
-- ============================================================
-- Включаем RLS. После этого ВСЕ запросы от пользователей
-- будут проходить через политики. Без политики — 0 строк.
-- Это "deny by default" — безопасно по умолчанию.

-- --- profiles ---
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Пользователь видит ТОЛЬКО свой профиль
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

-- Пользователь может обновлять ТОЛЬКО свой профиль
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())       -- какие строки видит (фильтр)
  WITH CHECK (id = auth.uid()); -- какие значения может записать

-- --- todos ---
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

-- SELECT: пользователь видит только свои задачи
CREATE POLICY "Users can view own todos"
  ON public.todos FOR SELECT
  USING (user_id = auth.uid());

-- INSERT: пользователь может создавать задачи только с своим user_id
-- WITH CHECK проверяет, что в INSERT user_id = текущий пользователь.
-- Без этого можно было бы вставить user_id другого пользователя!
CREATE POLICY "Users can create own todos"
  ON public.todos FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE: пользователь может обновлять только свои задачи
CREATE POLICY "Users can update own todos"
  ON public.todos FOR UPDATE
  USING (user_id = auth.uid())        -- какие строки может видеть
  WITH CHECK (user_id = auth.uid());  -- какие значения может записать

-- DELETE: пользователь может удалять только свои задачи
CREATE POLICY "Users can delete own todos"
  ON public.todos FOR DELETE
  USING (user_id = auth.uid());
