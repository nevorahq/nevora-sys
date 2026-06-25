-- ============================================================
-- Migration 038: устранение abuse публичного rate-limit RPC (P1)
-- ============================================================
-- Проблема (036): public.check_rate_limit(bucket, identifier, limit, window)
-- была GRANT'нута anon/authenticated и принимала ПРОИЗВОЛЬНЫЕ bucket /
-- identifier / limit / window. Любой клиент мог прямыми RPC-вызовами с
-- random identifier неограниченно плодить строки в rate_limit_hits
-- (DoS на хранилище), а также подменять limit/window, ослабляя лимит.
--
-- Исправление (двойная защита):
--   1. Клиентский доступ убран полностью. Функция вызывается только
--      server-side через service-role клиент (см. lib/supabase/service-role.ts).
--      EXECUTE отозван у PUBLIC/anon/authenticated, выдан только service_role.
--   2. Сигнатура сужена до (bucket, identifier). limit/window больше НЕ
--      приходят от вызывающего — они жёстко зашиты в allowlist внутри
--      функции. Неизвестный bucket и identifier не формата SHA-256 hex
--      отклоняются. Это убирает подмену лимитов и ограничивает рост данных.
-- ============================================================

-- Удаляем старую abuse-сигнатуру целиком (нельзя оставлять overload,
-- доступный anon/authenticated).
DROP FUNCTION IF EXISTS public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket      TEXT,
  p_identifier  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_limit          INTEGER;
  v_window_seconds INTEGER;
  v_now            TIMESTAMPTZ := now();
  v_window_start   TIMESTAMPTZ;
  v_count          INTEGER;
  v_retry_after    INTEGER;
BEGIN
  -- Allowlist: bucket → (limit, window). Источник правды для лимитов.
  -- Клиент НЕ может задать произвольные значения.
  CASE p_bucket
    WHEN 'booking:availability'  THEN v_limit := 120; v_window_seconds := 60;
    WHEN 'booking:requests:ip'   THEN v_limit := 20;  v_window_seconds := 60;
    WHEN 'booking:requests:org'  THEN v_limit := 8;   v_window_seconds := 60;
    WHEN 'booking:client-check'  THEN v_limit := 15;  v_window_seconds := 60;
    ELSE
      RAISE EXCEPTION 'unknown_rate_limit_bucket: %', p_bucket
        USING ERRCODE = '22023';
  END CASE;

  -- identifier обязан быть SHA-256 hex (64 символа [0-9a-f]) — это всё, что
  -- кладёт сюда adapter (хэш ip[+scope]). Никакого raw IP/PII.
  IF p_identifier IS NULL OR p_identifier !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_rate_limit_identifier' USING ERRCODE = '22023';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM v_now) / v_window_seconds) * v_window_seconds
  );

  -- Чистим протухшие окна этого identifier (ограничивает рост данных).
  DELETE FROM public.rate_limit_hits
  WHERE bucket = p_bucket
    AND identifier = p_identifier
    AND window_start < v_window_start;

  INSERT INTO public.rate_limit_hits (bucket, identifier, window_start, hit_count)
  VALUES (p_bucket, p_identifier, v_window_start, 1)
  ON CONFLICT (bucket, identifier, window_start)
  DO UPDATE SET hit_count = public.rate_limit_hits.hit_count + 1
  RETURNING hit_count INTO v_count;

  v_retry_after := GREATEST(
    1,
    CEIL(extract(epoch FROM (v_window_start + make_interval(secs => v_window_seconds) - v_now)))::INTEGER
  );

  RETURN jsonb_build_object(
    'allowed',             v_count <= v_limit,
    'remaining',           GREATEST(0, v_limit - v_count),
    'retry_after_seconds', v_retry_after
  );
END;
$$;

COMMENT ON FUNCTION public.check_rate_limit(TEXT, TEXT) IS
  'SERVER-ONLY fixed-window rate limiter. Вызывается только через service-role '
  'клиент; EXECUTE отозван у PUBLIC/anon/authenticated. limit/window зашиты в '
  'allowlist по bucket (клиент не может их подменить); identifier обязан быть '
  'SHA-256 hex (без PII). Возвращает { allowed, remaining, retry_after_seconds }.';

-- Доступ только service_role (серверный ключ). Клиентские роли — нет.
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT) TO service_role;
