-- ============================================================
-- Migration 021: Client booking conflict prevention
-- ============================================================
-- Клиент (по email или phone) не может иметь пересекающихся
-- бронирований ни у одного специалиста в рамках одной организации.
--
-- 1. check_client_booking_conflict_public — лёгкая SECURITY DEFINER
--    функция для pre-check из публичного API (без anon RLS).
-- 2. Обновлённый create_booking_request_public — добавлен шаг 9.5
--    «cross-host client conflict check» перед INSERT.
-- ============================================================


-- ============================================================
-- 1. check_client_booking_conflict_public
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_client_booking_conflict_public(
  p_organization_slug TEXT,
  p_client_email      TEXT        DEFAULT NULL,
  p_client_phone      TEXT        DEFAULT NULL,
  p_start_at          TIMESTAMPTZ DEFAULT NULL,
  p_end_at            TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_org_id        UUID;
  v_conflict_bool BOOLEAN := FALSE;
BEGIN
  -- Resolve organization_id via booking_page slug
  SELECT bp.organization_id INTO v_org_id
  FROM public.booking_pages bp
  JOIN public.organizations o ON o.id = bp.organization_id
  WHERE o.slug = p_organization_slug
    AND bp.public_enabled = true
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('conflict', false);
  END IF;

  -- Need at least one contact identifier
  IF p_client_email IS NULL AND p_client_phone IS NULL THEN
    RETURN jsonb_build_object('conflict', false);
  END IF;

  -- Need time range to check
  IF p_start_at IS NULL OR p_end_at IS NULL THEN
    RETURN jsonb_build_object('conflict', false);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.booking_requests br
    WHERE br.organization_id = v_org_id
      AND br.status IN ('pending', 'accepted')
      AND (
        (p_client_email IS NOT NULL
          AND length(trim(p_client_email)) > 0
          AND br.client_email = lower(trim(p_client_email)))
        OR
        (p_client_phone IS NOT NULL
          AND length(trim(p_client_phone)) > 0
          AND br.client_phone = trim(p_client_phone))
      )
      AND (br.requested_start_at, br.requested_end_at) OVERLAPS (p_start_at, p_end_at)
  ) INTO v_conflict_bool;

  RETURN jsonb_build_object('conflict', v_conflict_bool);
END;
$$;

COMMENT ON FUNCTION public.check_client_booking_conflict_public IS
  'Public SECURITY DEFINER check: does this client already have a booking '
  'that overlaps the requested time window in this organization? '
  'Returns { conflict: bool }. Bypasses RLS for anon callers.';

GRANT EXECUTE ON FUNCTION public.check_client_booking_conflict_public TO anon, authenticated;


-- ============================================================
-- 2. Updated create_booking_request_public — добавлен шаг 9.5
-- ============================================================
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

  -- ── 9. Slot conflict check for this host (with buffers) ───
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

  -- ── 9.5. Cross-host client conflict check ─────────────────
  -- Тот же клиент (по email или phone) не может иметь пересекающейся
  -- записи ни у одного специалиста в рамках этой организации.
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.booking_requests br
  WHERE br.organization_id = v_page.organization_id
    AND br.status IN ('pending', 'accepted')
    AND (
      (p_client_email IS NOT NULL
        AND length(trim(p_client_email)) > 0
        AND br.client_email = lower(trim(p_client_email)))
      OR
      (p_client_phone IS NOT NULL
        AND length(trim(p_client_phone)) > 0
        AND br.client_phone = trim(p_client_phone))
    )
    AND (br.requested_start_at, br.requested_end_at) OVERLAPS (p_start_at, v_end_at);

  IF v_conflict_count > 0 THEN
    RETURN jsonb_build_object('error', 'slot_conflict_client');
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
    organization_id, workspace_id, event_name,
    aggregate_type, aggregate_id, payload, created_by
  )
  VALUES (
    v_page.organization_id, v_page.workspace_id, 'booking.requested',
    'booking_request', v_request_id,
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
    organization_id, workspace_id, event_name,
    aggregate_type, aggregate_id, payload, created_by
  )
  VALUES (
    v_page.organization_id, v_page.workspace_id, 'crm.lead.created_from_booking',
    'client', v_lead_id,
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
