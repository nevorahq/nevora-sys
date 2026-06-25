-- ============================================================
-- Migration 036: DB-backed rate limiter (P1)
-- ============================================================
-- Зачем не in-memory: приложение деплоится в serverless/multi-instance
-- среде (каждый запрос может попасть на отдельный инстанс), поэтому
-- счётчик в памяти процесса не даёт реального лимита. Supabase/Postgres
-- — уже существующее общее хранилище проекта, поэтому fixed-window
-- лимитер живёт здесь, без внешних платных сервисов.
--
-- Идентификатор клиента приходит уже захэшированным из приложения
-- (sha256 от ip[+slug]) — в таблице не хранится сырой IP/email/phone.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  bucket        TEXT        NOT NULL,
  identifier    TEXT        NOT NULL,   -- opaque hash, без PII
  window_start  TIMESTAMPTZ NOT NULL,
  hit_count     INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, identifier, window_start)
);

COMMENT ON TABLE public.rate_limit_hits IS
  'Fixed-window rate limit counters. identifier is an opaque hash (no PII). '
  'Old rows are pruned opportunistically by check_rate_limit.';

-- Только владелец/служебные роли пишут сюда — через SECURITY DEFINER RPC.
-- Клиентам прямой доступ к таблице не нужен.
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_hits FROM PUBLIC;
REVOKE ALL ON TABLE public.rate_limit_hits FROM anon;
REVOKE ALL ON TABLE public.rate_limit_hits FROM authenticated;

-- ------------------------------------------------------------
-- check_rate_limit — атомарно инкрементирует счётчик текущего окна
-- и сообщает, разрешён ли запрос.
--
-- Возвращает JSONB:
--   { allowed: bool, remaining: int, retry_after_seconds: int }
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket          TEXT,
  p_identifier      TEXT,
  p_limit           INTEGER,
  p_window_seconds  INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_now          TIMESTAMPTZ := now();
  v_window_start TIMESTAMPTZ;
  v_count        INTEGER;
  v_retry_after  INTEGER;
BEGIN
  -- Строгая валидация входных данных.
  IF p_bucket IS NULL OR length(p_bucket) = 0 OR length(p_bucket) > 64 THEN
    RAISE EXCEPTION 'invalid_bucket' USING ERRCODE = '22023';
  END IF;
  IF p_identifier IS NULL OR length(p_identifier) = 0 OR length(p_identifier) > 128 THEN
    RAISE EXCEPTION 'invalid_identifier' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100000 THEN
    RAISE EXCEPTION 'invalid_limit' USING ERRCODE = '22023';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid_window' USING ERRCODE = '22023';
  END IF;

  -- Начало текущего фиксированного окна (выравнивание по epoch).
  v_window_start := to_timestamp(
    floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds
  );

  -- Опортунистическая очистка протухших окон для этого identifier.
  DELETE FROM public.rate_limit_hits
  WHERE bucket = p_bucket
    AND identifier = p_identifier
    AND window_start < v_window_start;

  -- Атомарный upsert + инкремент.
  INSERT INTO public.rate_limit_hits (bucket, identifier, window_start, hit_count)
  VALUES (p_bucket, p_identifier, v_window_start, 1)
  ON CONFLICT (bucket, identifier, window_start)
  DO UPDATE SET hit_count = public.rate_limit_hits.hit_count + 1
  RETURNING hit_count INTO v_count;

  v_retry_after := GREATEST(
    1,
    CEIL(extract(epoch FROM (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::INTEGER
  );

  RETURN jsonb_build_object(
    'allowed',             v_count <= p_limit,
    'remaining',           GREATEST(0, p_limit - v_count),
    'retry_after_seconds', v_retry_after
  );
END;
$$;

COMMENT ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) IS
  'Fixed-window rate limiter. Atomically increments the counter for the current '
  'window and returns { allowed, remaining, retry_after_seconds }. identifier must '
  'be an opaque hash (no PII). EXECUTE: anon + authenticated.';

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO anon, authenticated;
