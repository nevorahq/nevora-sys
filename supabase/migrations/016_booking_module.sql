-- ============================================================
-- Migration 016: Booking Module
-- ============================================================
-- Публичная система бронирования — новый входящий канал CRM.
--
-- Порядок создания (зависимости сверху вниз):
--   booking_pages
--   → booking_host_profiles
--   → booking_services
--   → booking_host_services
--   → booking_availability_rules
--   → booking_blackout_dates
--   → booking_requests
--
-- RLS стратегия:
--   authenticated (внутренние операции) — через is_org_member() / can_write_data()
--   anon (публичный клиент) — только SELECT публично включённых страниц/профилей
--   booking_requests INSERT — только через SECURITY DEFINER RPC
--
-- Все таблицы: organization_id + RLS + индексы + updated_at триггер.
-- ============================================================


-- ============================================================
-- 1. BOOKING_PAGES
-- ============================================================
-- Публичная страница бронирования организации.
-- Одна организация — одна страница (уникальный slug).
-- public_enabled = false → страница закрыта для внешних клиентов.

CREATE TABLE IF NOT EXISTS public.booking_pages (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id      UUID                   REFERENCES public.workspaces(id)  ON DELETE SET NULL,
  slug              TEXT        NOT NULL,
  title             TEXT        NOT NULL,
  description       TEXT,
  public_enabled    BOOLEAN     NOT NULL DEFAULT false,
  default_timezone  TEXT        NOT NULL DEFAULT 'Europe/Chisinau',
  brand_config      JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT booking_pages_org_slug_unique UNIQUE (organization_id, slug)
);

COMMENT ON TABLE public.booking_pages IS
  'Public booking page for an organization. Entry point for external clients.';

CREATE INDEX IF NOT EXISTS booking_pages_org_idx
  ON public.booking_pages(organization_id);

CREATE INDEX IF NOT EXISTS booking_pages_slug_idx
  ON public.booking_pages(slug) WHERE public_enabled = true;

DROP TRIGGER IF EXISTS booking_pages_updated_at ON public.booking_pages;
CREATE TRIGGER booking_pages_updated_at
  BEFORE UPDATE ON public.booking_pages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 2. BOOKING_HOST_PROFILES
-- ============================================================
-- Публичный профиль сотрудника, принимающего записи.
-- Привязан к внутреннему пользователю (user_id) и членству (membership_id).
-- host_slug — публичный URL-идентификатор: /booking/acme/ion-popescu

CREATE TABLE IF NOT EXISTS public.booking_host_profiles (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id      UUID                   REFERENCES public.workspaces(id)  ON DELETE SET NULL,
  booking_page_id   UUID        NOT NULL REFERENCES public.booking_pages(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  membership_id     UUID        NOT NULL REFERENCES public.memberships(id)   ON DELETE CASCADE,
  host_slug         TEXT        NOT NULL,
  display_name      TEXT        NOT NULL,
  public_title      TEXT,
  public_bio        TEXT,
  avatar_url        TEXT,
  timezone          TEXT        NOT NULL DEFAULT 'Europe/Chisinau',
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  sort_order        INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT booking_host_profiles_org_slug_unique  UNIQUE (organization_id, host_slug),
  CONSTRAINT booking_host_profiles_org_user_unique  UNIQUE (organization_id, user_id)
);

COMMENT ON TABLE public.booking_host_profiles IS
  'Public booking profile for an internal user. Can be sales manager, consultant, specialist, etc.';

CREATE INDEX IF NOT EXISTS booking_host_profiles_page_idx
  ON public.booking_host_profiles(booking_page_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS booking_host_profiles_user_idx
  ON public.booking_host_profiles(user_id);

CREATE INDEX IF NOT EXISTS booking_host_profiles_org_idx
  ON public.booking_host_profiles(organization_id);

DROP TRIGGER IF EXISTS booking_host_profiles_updated_at ON public.booking_host_profiles;
CREATE TRIGGER booking_host_profiles_updated_at
  BEFORE UPDATE ON public.booking_host_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 3. BOOKING_SERVICES
-- ============================================================
-- Тип встречи / услуга. Аналог Event Type в Cal.com.
-- duration_minutes: длительность слота.
-- slot_interval_minutes: шаг генерации слотов (30 → 09:00, 09:30...).
-- buffer_before/after: мёртвое время вокруг встречи.
-- minimum_notice_minutes: минимальное время до встречи (клиент не может забронировать "прямо сейчас").
-- booking_window_days: количество дней вперёд, доступных для бронирования.

CREATE TABLE IF NOT EXISTS public.booking_services (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id                UUID                   REFERENCES public.workspaces(id)  ON DELETE SET NULL,
  booking_page_id             UUID        NOT NULL REFERENCES public.booking_pages(id) ON DELETE CASCADE,
  name                        TEXT        NOT NULL,
  slug                        TEXT        NOT NULL,
  description                 TEXT,
  duration_minutes            INTEGER     NOT NULL CHECK (duration_minutes > 0),
  slot_interval_minutes       INTEGER     NOT NULL DEFAULT 30 CHECK (slot_interval_minutes > 0),
  buffer_before_minutes       INTEGER     NOT NULL DEFAULT 0  CHECK (buffer_before_minutes >= 0),
  buffer_after_minutes        INTEGER     NOT NULL DEFAULT 0  CHECK (buffer_after_minutes >= 0),
  minimum_notice_minutes      INTEGER     NOT NULL DEFAULT 60 CHECK (minimum_notice_minutes >= 0),
  booking_window_days         INTEGER     NOT NULL DEFAULT 30 CHECK (booking_window_days > 0),
  requires_manual_confirmation BOOLEAN    NOT NULL DEFAULT true,
  is_active                   BOOLEAN     NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT booking_services_org_slug_unique UNIQUE (organization_id, slug)
);

COMMENT ON TABLE public.booking_services IS
  'Appointment type / service. Defines duration, slot logic, and booking window. Equivalent to Cal.com Event Type.';

CREATE INDEX IF NOT EXISTS booking_services_page_idx
  ON public.booking_services(booking_page_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS booking_services_org_idx
  ON public.booking_services(organization_id);

DROP TRIGGER IF EXISTS booking_services_updated_at ON public.booking_services;
CREATE TRIGGER booking_services_updated_at
  BEFORE UPDATE ON public.booking_services
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 4. BOOKING_HOST_SERVICES
-- ============================================================
-- Many-to-many: какой хост предоставляет какие услуги.

CREATE TABLE IF NOT EXISTS public.booking_host_services (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID        NOT NULL REFERENCES public.organizations(id)         ON DELETE CASCADE,
  workspace_id             UUID                   REFERENCES public.workspaces(id)          ON DELETE SET NULL,
  booking_host_profile_id  UUID        NOT NULL REFERENCES public.booking_host_profiles(id) ON DELETE CASCADE,
  booking_service_id       UUID        NOT NULL REFERENCES public.booking_services(id)       ON DELETE CASCADE,
  is_active                BOOLEAN     NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT booking_host_services_unique UNIQUE (booking_host_profile_id, booking_service_id)
);

COMMENT ON TABLE public.booking_host_services IS
  'Junction: which host provides which services.';

CREATE INDEX IF NOT EXISTS booking_host_services_host_idx
  ON public.booking_host_services(booking_host_profile_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS booking_host_services_service_idx
  ON public.booking_host_services(booking_service_id);

CREATE INDEX IF NOT EXISTS booking_host_services_org_idx
  ON public.booking_host_services(organization_id);


-- ============================================================
-- 5. BOOKING_AVAILABILITY_RULES
-- ============================================================
-- Еженедельное расписание хоста.
-- day_of_week: 0=Sunday, 1=Monday, ..., 6=Saturday
-- Может быть несколько записей на один день (перерывы).

CREATE TABLE IF NOT EXISTS public.booking_availability_rules (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID        NOT NULL REFERENCES public.organizations(id)         ON DELETE CASCADE,
  workspace_id             UUID                   REFERENCES public.workspaces(id)          ON DELETE SET NULL,
  booking_host_profile_id  UUID        NOT NULL REFERENCES public.booking_host_profiles(id) ON DELETE CASCADE,
  day_of_week              INTEGER     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time               TIME        NOT NULL,
  end_time                 TIME        NOT NULL,
  is_active                BOOLEAN     NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT booking_availability_rules_time_check CHECK (start_time < end_time)
);

COMMENT ON TABLE public.booking_availability_rules IS
  'Weekly working hours per host. 0=Sunday..6=Saturday. Multiple rows per day allowed (breaks).';

CREATE INDEX IF NOT EXISTS booking_availability_rules_host_idx
  ON public.booking_availability_rules(booking_host_profile_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS booking_availability_rules_org_idx
  ON public.booking_availability_rules(organization_id);

DROP TRIGGER IF EXISTS booking_availability_rules_updated_at ON public.booking_availability_rules;
CREATE TRIGGER booking_availability_rules_updated_at
  BEFORE UPDATE ON public.booking_availability_rules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 6. BOOKING_BLACKOUT_DATES
-- ============================================================
-- Периоды недоступности хоста (отпуск, праздники, болезнь).

CREATE TABLE IF NOT EXISTS public.booking_blackout_dates (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID        NOT NULL REFERENCES public.organizations(id)         ON DELETE CASCADE,
  workspace_id             UUID                   REFERENCES public.workspaces(id)          ON DELETE SET NULL,
  booking_host_profile_id  UUID        NOT NULL REFERENCES public.booking_host_profiles(id) ON DELETE CASCADE,
  starts_at                TIMESTAMPTZ NOT NULL,
  ends_at                  TIMESTAMPTZ NOT NULL,
  reason                   TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT booking_blackout_dates_range_check CHECK (starts_at < ends_at)
);

COMMENT ON TABLE public.booking_blackout_dates IS
  'Unavailable periods for a host (vacation, holidays, sick leave).';

CREATE INDEX IF NOT EXISTS booking_blackout_dates_host_idx
  ON public.booking_blackout_dates(booking_host_profile_id, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS booking_blackout_dates_org_idx
  ON public.booking_blackout_dates(organization_id);


-- ============================================================
-- 7. BOOKING_REQUESTS
-- ============================================================
-- Запрос на бронирование от внешнего клиента.
-- status: pending (создан) → accepted | rejected | canceled
-- lead_id: ссылка на созданный CRM лид (crm_clients.id)
-- source_channel: 'booking' для P0. В будущем: phone/email/telegram/etc.
-- assigned_to_user_id: internal user (booking host), кому назначен лид.

CREATE TABLE IF NOT EXISTS public.booking_requests (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID        NOT NULL REFERENCES public.organizations(id)         ON DELETE CASCADE,
  workspace_id             UUID                   REFERENCES public.workspaces(id)          ON DELETE SET NULL,
  booking_page_id          UUID        NOT NULL REFERENCES public.booking_pages(id)         ON DELETE RESTRICT,
  booking_host_profile_id  UUID        NOT NULL REFERENCES public.booking_host_profiles(id) ON DELETE RESTRICT,
  booking_service_id       UUID        NOT NULL REFERENCES public.booking_services(id)       ON DELETE RESTRICT,
  lead_id                  UUID,
  assigned_to_user_id      UUID        NOT NULL REFERENCES auth.users(id)                   ON DELETE RESTRICT,
  requested_start_at       TIMESTAMPTZ NOT NULL,
  requested_end_at         TIMESTAMPTZ NOT NULL,
  client_name              TEXT        NOT NULL,
  client_email             TEXT,
  client_phone             TEXT,
  message                  TEXT,
  status                   TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'accepted', 'rejected', 'canceled')),
  source_channel           TEXT        NOT NULL DEFAULT 'booking',
  client_timezone          TEXT,
  metadata                 JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT booking_requests_time_check CHECK (requested_start_at < requested_end_at)
);

COMMENT ON TABLE public.booking_requests IS
  'Inbound booking request from external client. P0: status=pending until host confirms/rejects.';

CREATE INDEX IF NOT EXISTS booking_requests_org_status_idx
  ON public.booking_requests(organization_id, status);

CREATE INDEX IF NOT EXISTS booking_requests_host_idx
  ON public.booking_requests(booking_host_profile_id, requested_start_at);

CREATE INDEX IF NOT EXISTS booking_requests_assigned_idx
  ON public.booking_requests(assigned_to_user_id, status);

CREATE INDEX IF NOT EXISTS booking_requests_lead_idx
  ON public.booking_requests(lead_id) WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS booking_requests_time_idx
  ON public.booking_requests(organization_id, requested_start_at);

DROP TRIGGER IF EXISTS booking_requests_updated_at ON public.booking_requests;
CREATE TRIGGER booking_requests_updated_at
  BEFORE UPDATE ON public.booking_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 8. RLS — booking_pages
-- ============================================================
ALTER TABLE public.booking_pages ENABLE ROW LEVEL SECURITY;

-- Authenticated: члены org видят свои страницы
DROP POLICY IF EXISTS "booking_pages_select_auth" ON public.booking_pages;
CREATE POLICY "booking_pages_select_auth"
  ON public.booking_pages FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- Anon: видят только публично включённые страницы
DROP POLICY IF EXISTS "booking_pages_select_anon" ON public.booking_pages;
CREATE POLICY "booking_pages_select_anon"
  ON public.booking_pages FOR SELECT TO anon
  USING (public_enabled = true);

DROP POLICY IF EXISTS "booking_pages_insert" ON public.booking_pages;
CREATE POLICY "booking_pages_insert"
  ON public.booking_pages FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace(organization_id));

DROP POLICY IF EXISTS "booking_pages_update" ON public.booking_pages;
CREATE POLICY "booking_pages_update"
  ON public.booking_pages FOR UPDATE TO authenticated
  USING  (public.can_manage_workspace(organization_id))
  WITH CHECK (public.can_manage_workspace(organization_id));

DROP POLICY IF EXISTS "booking_pages_delete" ON public.booking_pages;
CREATE POLICY "booking_pages_delete"
  ON public.booking_pages FOR DELETE TO authenticated
  USING (public.can_manage_workspace(organization_id));


-- ============================================================
-- 9. RLS — booking_host_profiles
-- ============================================================
ALTER TABLE public.booking_host_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "booking_host_profiles_select_auth" ON public.booking_host_profiles;
CREATE POLICY "booking_host_profiles_select_auth"
  ON public.booking_host_profiles FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- Anon: только активные профили публично включённых страниц
DROP POLICY IF EXISTS "booking_host_profiles_select_anon" ON public.booking_host_profiles;
CREATE POLICY "booking_host_profiles_select_anon"
  ON public.booking_host_profiles FOR SELECT TO anon
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.booking_pages bp
      WHERE bp.id = booking_page_id AND bp.public_enabled = true
    )
  );

DROP POLICY IF EXISTS "booking_host_profiles_insert" ON public.booking_host_profiles;
CREATE POLICY "booking_host_profiles_insert"
  ON public.booking_host_profiles FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace(organization_id));

DROP POLICY IF EXISTS "booking_host_profiles_update" ON public.booking_host_profiles;
CREATE POLICY "booking_host_profiles_update"
  ON public.booking_host_profiles FOR UPDATE TO authenticated
  USING  (public.can_manage_workspace(organization_id))
  WITH CHECK (public.can_manage_workspace(organization_id));

DROP POLICY IF EXISTS "booking_host_profiles_delete" ON public.booking_host_profiles;
CREATE POLICY "booking_host_profiles_delete"
  ON public.booking_host_profiles FOR DELETE TO authenticated
  USING (public.can_manage_workspace(organization_id));


-- ============================================================
-- 10. RLS — booking_services
-- ============================================================
ALTER TABLE public.booking_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "booking_services_select_auth" ON public.booking_services;
CREATE POLICY "booking_services_select_auth"
  ON public.booking_services FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "booking_services_select_anon" ON public.booking_services;
CREATE POLICY "booking_services_select_anon"
  ON public.booking_services FOR SELECT TO anon
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.booking_pages bp
      WHERE bp.id = booking_page_id AND bp.public_enabled = true
    )
  );

DROP POLICY IF EXISTS "booking_services_insert" ON public.booking_services;
CREATE POLICY "booking_services_insert"
  ON public.booking_services FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace(organization_id));

DROP POLICY IF EXISTS "booking_services_update" ON public.booking_services;
CREATE POLICY "booking_services_update"
  ON public.booking_services FOR UPDATE TO authenticated
  USING  (public.can_manage_workspace(organization_id))
  WITH CHECK (public.can_manage_workspace(organization_id));

DROP POLICY IF EXISTS "booking_services_delete" ON public.booking_services;
CREATE POLICY "booking_services_delete"
  ON public.booking_services FOR DELETE TO authenticated
  USING (public.can_manage_workspace(organization_id));


-- ============================================================
-- 11. RLS — booking_host_services
-- ============================================================
ALTER TABLE public.booking_host_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "booking_host_services_select_auth" ON public.booking_host_services;
CREATE POLICY "booking_host_services_select_auth"
  ON public.booking_host_services FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "booking_host_services_select_anon" ON public.booking_host_services;
CREATE POLICY "booking_host_services_select_anon"
  ON public.booking_host_services FOR SELECT TO anon
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.booking_host_profiles bhp
      WHERE bhp.id = booking_host_profile_id AND bhp.is_active = true
    )
  );

DROP POLICY IF EXISTS "booking_host_services_insert" ON public.booking_host_services;
CREATE POLICY "booking_host_services_insert"
  ON public.booking_host_services FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_workspace(organization_id));

DROP POLICY IF EXISTS "booking_host_services_update" ON public.booking_host_services;
CREATE POLICY "booking_host_services_update"
  ON public.booking_host_services FOR UPDATE TO authenticated
  USING  (public.can_manage_workspace(organization_id))
  WITH CHECK (public.can_manage_workspace(organization_id));

DROP POLICY IF EXISTS "booking_host_services_delete" ON public.booking_host_services;
CREATE POLICY "booking_host_services_delete"
  ON public.booking_host_services FOR DELETE TO authenticated
  USING (public.can_manage_workspace(organization_id));


-- ============================================================
-- 12. RLS — booking_availability_rules
-- ============================================================
ALTER TABLE public.booking_availability_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "booking_availability_rules_select_auth" ON public.booking_availability_rules;
CREATE POLICY "booking_availability_rules_select_auth"
  ON public.booking_availability_rules FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "booking_availability_rules_select_anon" ON public.booking_availability_rules;
CREATE POLICY "booking_availability_rules_select_anon"
  ON public.booking_availability_rules FOR SELECT TO anon
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.booking_host_profiles bhp
      WHERE bhp.id = booking_host_profile_id AND bhp.is_active = true
    )
  );

DROP POLICY IF EXISTS "booking_availability_rules_insert" ON public.booking_availability_rules;
CREATE POLICY "booking_availability_rules_insert"
  ON public.booking_availability_rules FOR INSERT TO authenticated
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "booking_availability_rules_update" ON public.booking_availability_rules;
CREATE POLICY "booking_availability_rules_update"
  ON public.booking_availability_rules FOR UPDATE TO authenticated
  USING  (public.can_write_data(organization_id))
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "booking_availability_rules_delete" ON public.booking_availability_rules;
CREATE POLICY "booking_availability_rules_delete"
  ON public.booking_availability_rules FOR DELETE TO authenticated
  USING (public.can_write_data(organization_id));


-- ============================================================
-- 13. RLS — booking_blackout_dates
-- ============================================================
ALTER TABLE public.booking_blackout_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "booking_blackout_dates_select_auth" ON public.booking_blackout_dates;
CREATE POLICY "booking_blackout_dates_select_auth"
  ON public.booking_blackout_dates FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "booking_blackout_dates_select_anon" ON public.booking_blackout_dates;
CREATE POLICY "booking_blackout_dates_select_anon"
  ON public.booking_blackout_dates FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.booking_host_profiles bhp
      WHERE bhp.id = booking_host_profile_id AND bhp.is_active = true
    )
  );

DROP POLICY IF EXISTS "booking_blackout_dates_insert" ON public.booking_blackout_dates;
CREATE POLICY "booking_blackout_dates_insert"
  ON public.booking_blackout_dates FOR INSERT TO authenticated
  WITH CHECK (public.can_write_data(organization_id));

DROP POLICY IF EXISTS "booking_blackout_dates_delete" ON public.booking_blackout_dates;
CREATE POLICY "booking_blackout_dates_delete"
  ON public.booking_blackout_dates FOR DELETE TO authenticated
  USING (public.can_write_data(organization_id));


-- ============================================================
-- 14. RLS — booking_requests
-- ============================================================
-- INSERT доступен только через SECURITY DEFINER RPC — нет anon INSERT policy.
-- SELECT: authenticated члены org + назначенный пользователь.
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "booking_requests_select" ON public.booking_requests;
CREATE POLICY "booking_requests_select"
  ON public.booking_requests FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "booking_requests_update" ON public.booking_requests;
CREATE POLICY "booking_requests_update"
  ON public.booking_requests FOR UPDATE TO authenticated
  USING  (public.can_write_data(organization_id))
  WITH CHECK (public.can_write_data(organization_id));


-- ============================================================
-- 15. PUBLIC RPC: create_booking_request_public()
-- ============================================================
-- SECURITY DEFINER функция — единственная точка входа для
-- публичного создания booking request.
--
-- Выполняет атомарно:
--   1. Резолвит organization_id через slug booking_page
--   2. Проверяет что страница публично включена
--   3. Резолвит host по host_slug
--   4. Резолвит service по service_slug
--   5. Проверяет связь host↔service
--   6. Перепроверяет доступность слота
--   7. Создаёт booking_request
--   8. Создаёт crm_clients запись (lead)
--   9. Линкует booking_request.lead_id
--  10. Создаёт domain_event booking.requested
--
-- Клиент передаёт ТОЛЬКО: slugs, time, contact info.
-- Никогда не принимает: organization_id, user_id, host_id, service_id, status.

CREATE OR REPLACE FUNCTION public.create_booking_request_public(
  p_organization_slug   TEXT,
  p_host_slug           TEXT,
  p_service_slug        TEXT,
  p_start_at            TIMESTAMPTZ,
  p_client_name         TEXT,
  p_client_email        TEXT        DEFAULT NULL,
  p_client_phone        TEXT        DEFAULT NULL,
  p_client_timezone     TEXT        DEFAULT NULL,
  p_message             TEXT        DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_page              public.booking_pages%ROWTYPE;
  v_host              public.booking_host_profiles%ROWTYPE;
  v_service           public.booking_services%ROWTYPE;
  v_end_at            TIMESTAMPTZ;
  v_min_notice_at     TIMESTAMPTZ;
  v_max_window_at     TIMESTAMPTZ;
  v_conflict_count    INTEGER;
  v_request_id        UUID;
  v_lead_id           UUID;
  v_host_service_ok   BOOLEAN;
BEGIN
  -- ── 1. Validate basic input ───────────────────────────────
  IF length(trim(p_client_name)) = 0 THEN
    RETURN jsonb_build_object('error', 'client_name_required');
  END IF;

  IF p_client_email IS NULL AND p_client_phone IS NULL THEN
    RETURN jsonb_build_object('error', 'contact_method_required');
  END IF;

  -- ── 2. Resolve booking page via organization slug ─────────
  SELECT bp.* INTO v_page
  FROM public.booking_pages bp
  JOIN public.organizations o ON o.id = bp.organization_id
  WHERE o.slug = p_organization_slug
    AND bp.public_enabled = true
  LIMIT 1;

  IF v_page.id IS NULL THEN
    RETURN jsonb_build_object('error', 'booking_page_not_found');
  END IF;

  -- ── 3. Resolve host ───────────────────────────────────────
  SELECT * INTO v_host
  FROM public.booking_host_profiles
  WHERE organization_id = v_page.organization_id
    AND host_slug = p_host_slug
    AND is_active = true
  LIMIT 1;

  IF v_host.id IS NULL THEN
    RETURN jsonb_build_object('error', 'host_not_found');
  END IF;

  -- ── 4. Resolve service ────────────────────────────────────
  SELECT * INTO v_service
  FROM public.booking_services
  WHERE organization_id = v_page.organization_id
    AND slug = p_service_slug
    AND is_active = true
  LIMIT 1;

  IF v_service.id IS NULL THEN
    RETURN jsonb_build_object('error', 'service_not_found');
  END IF;

  -- ── 5. Verify host↔service relation ──────────────────────
  SELECT EXISTS (
    SELECT 1 FROM public.booking_host_services
    WHERE booking_host_profile_id = v_host.id
      AND booking_service_id = v_service.id
      AND is_active = true
  ) INTO v_host_service_ok;

  IF NOT v_host_service_ok THEN
    RETURN jsonb_build_object('error', 'service_not_offered_by_host');
  END IF;

  -- ── 6. Calculate end time ─────────────────────────────────
  v_end_at := p_start_at + (v_service.duration_minutes || ' minutes')::INTERVAL;

  -- ── 7. Minimum notice check ───────────────────────────────
  v_min_notice_at := now() + (v_service.minimum_notice_minutes || ' minutes')::INTERVAL;
  IF p_start_at < v_min_notice_at THEN
    RETURN jsonb_build_object('error', 'slot_too_soon');
  END IF;

  -- ── 8. Booking window check ───────────────────────────────
  v_max_window_at := now() + (v_service.booking_window_days || ' days')::INTERVAL;
  IF p_start_at > v_max_window_at THEN
    RETURN jsonb_build_object('error', 'slot_out_of_window');
  END IF;

  -- ── 9. Conflict check (including buffers) ─────────────────
  -- Effective window: start - buffer_before to end + buffer_after
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.booking_requests br
  WHERE br.booking_host_profile_id = v_host.id
    AND br.status IN ('pending', 'accepted')
    AND (
      br.requested_start_at - (v_service.buffer_before_minutes || ' minutes')::INTERVAL,
      br.requested_end_at   + (v_service.buffer_after_minutes  || ' minutes')::INTERVAL
    ) OVERLAPS (
      p_start_at - (v_service.buffer_before_minutes || ' minutes')::INTERVAL,
      v_end_at   + (v_service.buffer_after_minutes  || ' minutes')::INTERVAL
    );

  IF v_conflict_count > 0 THEN
    RETURN jsonb_build_object('error', 'slot_not_available');
  END IF;

  -- ── 10. Blackout check ────────────────────────────────────
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.booking_blackout_dates
  WHERE booking_host_profile_id = v_host.id
    AND (starts_at, ends_at) OVERLAPS (p_start_at, v_end_at);

  IF v_conflict_count > 0 THEN
    RETURN jsonb_build_object('error', 'slot_not_available');
  END IF;

  -- ── 11. Insert booking_request ────────────────────────────
  INSERT INTO public.booking_requests (
    organization_id,
    workspace_id,
    booking_page_id,
    booking_host_profile_id,
    booking_service_id,
    assigned_to_user_id,
    requested_start_at,
    requested_end_at,
    client_name,
    client_email,
    client_phone,
    message,
    status,
    source_channel,
    client_timezone
  )
  VALUES (
    v_page.organization_id,
    v_page.workspace_id,
    v_page.id,
    v_host.id,
    v_service.id,
    v_host.user_id,
    p_start_at,
    v_end_at,
    trim(p_client_name),
    lower(trim(p_client_email)),
    trim(p_client_phone),
    trim(p_message),
    'pending',
    'booking',
    p_client_timezone
  )
  RETURNING id INTO v_request_id;

  -- ── 12. Create CRM lead (crm_clients) ────────────────────
  INSERT INTO public.crm_clients (
    organization_id,
    workspace_id,
    name,
    email,
    phone,
    client_type,
    status,
    source,
    source_entity_type,
    source_entity_id,
    assigned_to,
    created_by,
    updated_by
  )
  VALUES (
    v_page.organization_id,
    v_page.workspace_id,
    trim(p_client_name),
    lower(trim(p_client_email)),
    trim(p_client_phone),
    'individual',
    'lead',
    'booking',
    'booking_request',
    v_request_id,
    v_host.user_id,
    v_host.user_id,
    v_host.user_id
  )
  RETURNING id INTO v_lead_id;

  -- ── 13. Link booking_request → CRM lead ──────────────────
  UPDATE public.booking_requests
  SET lead_id = v_lead_id
  WHERE id = v_request_id;

  -- ── 14. Domain event: booking.requested ──────────────────
  INSERT INTO public.domain_events (
    organization_id,
    workspace_id,
    event_name,
    aggregate_type,
    aggregate_id,
    payload,
    created_by
  )
  VALUES (
    v_page.organization_id,
    v_page.workspace_id,
    'booking.requested',
    'booking_request',
    v_request_id,
    jsonb_build_object(
      'client_name',    trim(p_client_name),
      'service_name',   v_service.name,
      'host_slug',      p_host_slug,
      'start_at',       p_start_at,
      'source_channel', 'booking'
    ),
    v_host.user_id
  );

  -- ── 15. Domain event: crm.lead.created_from_booking ──────
  INSERT INTO public.domain_events (
    organization_id,
    workspace_id,
    event_name,
    aggregate_type,
    aggregate_id,
    payload,
    created_by
  )
  VALUES (
    v_page.organization_id,
    v_page.workspace_id,
    'crm.lead.created_from_booking',
    'client',
    v_lead_id,
    jsonb_build_object(
      'name',                trim(p_client_name),
      'source',              'booking',
      'booking_request_id',  v_request_id,
      'assigned_to_user_id', v_host.user_id
    ),
    v_host.user_id
  );

  RETURN jsonb_build_object(
    'bookingRequestId', v_request_id,
    'leadId',           v_lead_id
  );
END;
$$;

COMMENT ON FUNCTION public.create_booking_request_public IS
  'Public SECURITY DEFINER RPC for booking request creation. '
  'Resolves slugs → IDs, validates slot, creates booking_request + CRM lead atomically. '
  'Never accepts organization_id/user_id/host_id from client.';


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name LIKE 'booking_%'
--   ORDER BY table_name;
--
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename LIKE 'booking_%';
-- ============================================================
