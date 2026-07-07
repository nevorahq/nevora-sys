-- =============================================================================
-- Migration 086: Trial Reuse Protection / Trial Eligibility Guard
--
-- Проблема: trial провижинится безусловно внутри create_organization() (024/049).
-- Пользователь мог создать вторую организацию (или удалить и создать заново)
-- и получить новый 14-дневный trial бесконечно.
--
-- Решение: право на trial отделяется от организации и хранится в
-- billing_trial_claims — одна запись на billing owner identity
-- (user_id + normalized_email_hash + будущий billing_customer_id).
--
--   1 billing owner identity = 1 trial (навсегда, claimed с момента активации)
--   Организация хранит только текущее состояние подписки.
--   Участие в чужой организации (invited member) trial НЕ сжигает:
--   claim создаётся только при провижининге СВОЕЙ организации.
--
-- Race safety: UNIQUE-констрейнты на user_id / normalized_email_hash /
-- billing_customer_id — параллельные активации не могут создать два claim.
--
-- Denied-путь: организация создаётся, но подписка сразу в состоянии
-- status='expired' + trial_ends_at=now() + metadata.trial_denied=true —
-- существующий enforcement (is_organization_writable, 027) немедленно
-- переводит workspace в read-only, UI предлагает платные планы.
--
-- Email: raw email НЕ хранится — только sha256(lower(trim(email))).
-- Salt: в БД нет серверного секрета; переход на salted/keyed hash — будущее
-- hardening (потребует пересчёта колонки), зафиксировано в docs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. pgcrypto для digest() (на Supabase включён по умолчанию; идемпотентно)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. Helper: нормализация + хеширование email (никогда не храним raw email)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalized_email_hash(p_email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, extensions, pg_catalog
AS $$
  SELECT encode(extensions.digest(convert_to(lower(trim(p_email)), 'UTF8'), 'sha256'), 'hex');
$$;

COMMENT ON FUNCTION public.normalized_email_hash(TEXT) IS
  'sha256 hex of lower(trim(email)). Used as the billing identity key in '
  'billing_trial_claims so raw emails are never persisted in billing tables.';

REVOKE ALL ON FUNCTION public.normalized_email_hash(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalized_email_hash(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.normalized_email_hash(TEXT) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. billing_trial_claims — право billing owner identity на trial
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_trial_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Организация, где trial был активирован. SET NULL: удаление организации
  -- НЕ возвращает право на trial — claim переживает организацию.
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,

  normalized_email_hash TEXT NOT NULL,
  -- Задел под платёжного провайдера (Stripe customer id и т.п.)
  billing_customer_id   TEXT,

  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'consumed', 'blocked')),

  trial_started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_ended_at    TIMESTAMPTZ,
  trial_consumed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Атомарный guard от повторного trial: любой дубликат identity падает
  -- на уровне БД, независимо от гонок в приложении.
  CONSTRAINT billing_trial_claims_user_id_key UNIQUE (user_id),
  CONSTRAINT billing_trial_claims_email_hash_key UNIQUE (normalized_email_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_trial_claims_customer_id_key
  ON public.billing_trial_claims (billing_customer_id)
  WHERE billing_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_trial_claims_organization_idx
  ON public.billing_trial_claims (organization_id);
CREATE INDEX IF NOT EXISTS billing_trial_claims_status_idx
  ON public.billing_trial_claims (status);
CREATE INDEX IF NOT EXISTS billing_trial_claims_started_idx
  ON public.billing_trial_claims (trial_started_at);

COMMENT ON TABLE public.billing_trial_claims IS
  'One row per billing owner identity. trial_started_at exists = trial already '
  'claimed — creating new organizations never grants another trial. Written '
  'only by SECURITY DEFINER billing functions, never by clients.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_updated_at'
      AND tgrelid = 'public.billing_trial_claims'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON public.billing_trial_claims
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

-- RLS: чтение — только свой claim или claim организации, где ты admin/owner.
-- INSERT/UPDATE/DELETE политик НЕТ: запись идёт исключительно через
-- SECURITY DEFINER функции ниже (никакого service role в application logic).
ALTER TABLE public.billing_trial_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trial_claims_select_own_or_admin" ON public.billing_trial_claims;
CREATE POLICY "trial_claims_select_own_or_admin"
  ON public.billing_trial_claims FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
  );

-- ---------------------------------------------------------------------------
-- 3. Backfill: существующие trial-подписки становятся claims их владельцев.
--    Без этого существующий пользователь получил бы «свежий» trial на org #2.
--    Одна организация на владельца (самая ранняя подписка выигрывает);
--    статус claim выводится из статуса подписки.
-- ---------------------------------------------------------------------------
INSERT INTO public.billing_trial_claims (
  user_id, organization_id, normalized_email_hash, status,
  trial_started_at, trial_ended_at, trial_consumed_at
)
SELECT DISTINCT ON (m.user_id)
  m.user_id,
  bs.organization_id,
  public.normalized_email_hash(u.email),
  CASE
    WHEN bs.status = 'trialing' AND bs.trial_ends_at > now() THEN 'active'
    ELSE 'consumed'
  END,
  COALESCE(bs.trial_start, bs.current_period_start, bs.created_at),
  bs.trial_ends_at,
  CASE
    WHEN bs.status = 'trialing' AND bs.trial_ends_at > now() THEN NULL
    ELSE COALESCE(bs.trial_ends_at, now())
  END
FROM public.billing_subscriptions bs
JOIN public.plans p ON p.id = bs.plan_id AND p.slug = 'trial'
JOIN public.memberships m
  ON m.organization_id = bs.organization_id
 AND m.role = 'owner'
 AND m.status = 'active'
JOIN auth.users u ON u.id = m.user_id
ORDER BY m.user_id, bs.created_at ASC
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. init_trial_subscription(org, owner) — атомарный claim + провижининг.
--    Меняется сигнатура и возврат (void → text), поэтому старую дропаем.
--    Internal-only (вызывается из create_organization) — как в 035.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.init_trial_subscription(UUID);

CREATE OR REPLACE FUNCTION public.init_trial_subscription(
  p_org_id   UUID,
  p_owner_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_plan_id    UUID;
  v_email      TEXT;
  v_hash       TEXT;
  v_claim_id   UUID;
  v_trial_ends TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_plan_id FROM public.plans WHERE slug = 'trial' LIMIT 1;
  IF v_plan_id IS NULL THEN RETURN 'no_trial_plan'; END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_owner_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'owner_not_found'; END IF;
  v_hash := public.normalized_email_hash(v_email);

  v_trial_ends := now() + INTERVAL '14 days';

  -- Атомарная попытка claim: UNIQUE(user_id) и UNIQUE(normalized_email_hash)
  -- гарантируют, что при любой гонке выживет ровно один claim.
  BEGIN
    INSERT INTO public.billing_trial_claims (
      user_id, organization_id, normalized_email_hash,
      status, trial_started_at, trial_ended_at
    ) VALUES (
      p_owner_id, p_org_id, v_hash,
      'active', now(), v_trial_ends
    )
    RETURNING id INTO v_claim_id;
  EXCEPTION WHEN unique_violation THEN
    v_claim_id := NULL;
  END;

  IF v_claim_id IS NOT NULL THEN
    -- Trial granted: trialing-подписка как раньше (024)
    INSERT INTO public.billing_subscriptions (
      organization_id, plan_id, status, billing_cycle,
      trial_ends_at, current_period_start, current_period_end
    ) VALUES (
      p_org_id, v_plan_id, 'trialing', 'monthly',
      v_trial_ends, now(), v_trial_ends
    )
    ON CONFLICT (organization_id) DO NOTHING;

    INSERT INTO public.domain_events (
      organization_id, event_name, aggregate_type, aggregate_id, payload, created_by
    ) VALUES (
      p_org_id, 'billing.trial.claimed', 'organization', p_org_id,
      jsonb_build_object(
        'organization_id', p_org_id,
        'user_id', p_owner_id,
        'plan', 'trial',
        'trial_started_at', now(),
        'trial_ended_at', v_trial_ends
      ),
      p_owner_id
    );

    INSERT INTO public.audit_logs (
      organization_id, user_id, entity_type, entity_id, action, new_data, metadata
    ) VALUES (
      p_org_id, p_owner_id, 'billing_trial_claims', v_claim_id, 'billing_change',
      jsonb_build_object('status', 'active', 'trial_ended_at', v_trial_ends),
      jsonb_build_object('event', 'trial_claimed', 'source', 'create_organization')
    );

    RETURN 'trial_granted';
  END IF;

  -- Trial denied: identity уже использовала trial. Организация создаётся,
  -- но подписка сразу «истёкшая» — 027-enforcement переводит её в read-only,
  -- продолжение только через платный план.
  INSERT INTO public.billing_subscriptions (
    organization_id, plan_id, status, billing_cycle,
    trial_ends_at, current_period_start, current_period_end, metadata
  ) VALUES (
    p_org_id, v_plan_id, 'expired', 'monthly',
    now(), now(), now(), '{"trial_denied": true}'::jsonb
  )
  ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO public.domain_events (
    organization_id, event_name, aggregate_type, aggregate_id, payload, created_by
  ) VALUES (
    p_org_id, 'billing.trial.denied', 'organization', p_org_id,
    jsonb_build_object(
      'organization_id', p_org_id,
      'user_id', p_owner_id,
      'reason', 'billing_identity_already_used'
    ),
    p_owner_id
  );

  INSERT INTO public.audit_logs (
    organization_id, user_id, entity_type, entity_id, action, new_data, metadata
  ) VALUES (
    p_org_id, p_owner_id, 'billing_subscriptions', p_org_id, 'billing_change',
    jsonb_build_object('status', 'expired', 'trial_denied', true),
    jsonb_build_object('event', 'trial_denied', 'source', 'create_organization')
  );

  RETURN 'trial_denied';
END;
$$;

COMMENT ON FUNCTION public.init_trial_subscription(UUID, UUID) IS
  'Claims the one-per-identity trial for the org owner (billing_trial_claims) '
  'and provisions the subscription: trialing when granted, expired/read-only '
  'when the identity already used its trial. Internal-only; called from '
  'create_organization().';

REVOKE ALL ON FUNCTION public.init_trial_subscription(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.init_trial_subscription(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.init_trial_subscription(UUID, UUID) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 5. create_organization() — передаём владельца в trial-провижининг
--    (сигнатура (TEXT,TEXT,TEXT) из 049 сохраняется, гранты не меняются)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_organization(
  p_name          TEXT,
  p_slug          TEXT,
  p_base_currency TEXT DEFAULT 'EUR'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_org_id    UUID;
  v_user_id   UUID;
  v_currency  TEXT;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_slug !~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$' THEN
    RAISE EXCEPTION 'invalid_slug';
  END IF;

  v_currency := upper(coalesce(nullif(trim(p_base_currency), ''), 'EUR'));
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'invalid_currency';
  END IF;

  -- 1. Организация (plan = legacy-зеркало, источник правды — подписка)
  INSERT INTO public.organizations (name, slug, plan, base_currency)
  VALUES (trim(p_name), lower(trim(p_slug)), 'trial', v_currency)
  RETURNING id INTO v_org_id;

  -- 2. Owner membership
  INSERT INTO public.memberships (user_id, organization_id, role, status)
  VALUES (v_user_id, v_org_id, 'owner', 'active');

  -- 3. Default workspace
  INSERT INTO public.workspaces (organization_id, name, slug, type, is_default)
  VALUES (v_org_id, 'General', lower(trim(p_slug)) || '-general', 'default', true);

  -- 4. Trial: один на billing owner identity (086). Повторная организация
  --    создаётся, но получает expired/read-only подписку вместо trial.
  PERFORM public.init_trial_subscription(v_org_id, v_user_id);

  RETURN v_org_id;
END;
$$;

COMMENT ON FUNCTION public.create_organization(TEXT, TEXT, TEXT) IS
  'Atomically creates org + owner membership + default workspace + subscription. '
  'The 14-day trial is granted only once per billing owner identity '
  '(billing_trial_claims); repeat organizations start billing_required. '
  'SECURITY DEFINER for RLS bootstrap.';

-- ---------------------------------------------------------------------------
-- 6. check_trial_eligibility() — контракт для UI/Server Actions.
--    Identity берётся ТОЛЬКО из auth.uid() — client payload не участвует.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_trial_eligibility()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id UUID;
  v_email   TEXT;
  v_status  TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT status INTO v_status
  FROM public.billing_trial_claims
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_status = 'active' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'trial_active');
  ELSIF v_status = 'consumed' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'trial_consumed');
  ELSIF v_status = 'blocked' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'trial_blocked');
  END IF;

  -- user_id чистый — проверяем email-identity (смена аккаунта на тот же email)
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.billing_trial_claims
    WHERE normalized_email_hash = public.normalized_email_hash(v_email)
  ) THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'billing_identity_already_used');
  END IF;

  RETURN jsonb_build_object('eligible', true, 'reason', 'never_used');
END;
$$;

COMMENT ON FUNCTION public.check_trial_eligibility() IS
  'Trial eligibility for the CURRENT user (auth.uid only, no client payload). '
  'UX helper — enforcement lives in init_trial_subscription + unique constraints.';

REVOKE ALL ON FUNCTION public.check_trial_eligibility() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_trial_eligibility() FROM anon;
GRANT EXECUTE ON FUNCTION public.check_trial_eligibility() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. consume_expired_trials() — cron-sweep: истёкшие trialing → expired,
--    их claims → consumed, события billing.trial.consumed / billing.plan.required.
--    Вызывается из /api/cron/trial-sweep (service role — established cron
--    pattern, не application logic).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_expired_trials()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_expired_subs INT := 0;
  v_consumed     INT := 0;
BEGIN
  -- 1. Просроченные trialing-подписки → expired (глобальный аналог
  --    refresh_trial_status из 027, который срабатывает лишь на рендере)
  WITH expired AS (
    UPDATE public.billing_subscriptions bs
    SET status = 'expired', updated_at = now()
    FROM public.plans p
    WHERE bs.plan_id = p.id
      AND p.slug = 'trial'
      AND bs.status = 'trialing'
      AND bs.trial_ends_at <= now()
    RETURNING bs.organization_id
  )
  SELECT count(*) INTO v_expired_subs FROM expired;

  -- 2. Активные claims, чей trial фактически закончился → consumed
  WITH consumed AS (
    UPDATE public.billing_trial_claims c
    SET status = 'consumed',
        trial_consumed_at = now(),
        trial_ended_at = COALESCE(c.trial_ended_at, now()),
        updated_at = now()
    WHERE c.status = 'active'
      AND (
        c.trial_ended_at <= now()
        OR EXISTS (
          SELECT 1
          FROM public.billing_subscriptions bs
          JOIN public.plans p ON p.id = bs.plan_id AND p.slug = 'trial'
          WHERE bs.organization_id = c.organization_id
            AND (bs.status IN ('expired', 'canceled') OR bs.trial_ends_at <= now())
        )
      )
    RETURNING c.id, c.user_id, c.organization_id, c.trial_ended_at
  ),
  events AS (
    INSERT INTO public.domain_events (
      organization_id, event_name, aggregate_type, aggregate_id, payload, created_by
    )
    SELECT
      organization_id, event_name, 'organization', organization_id,
      jsonb_build_object(
        'organization_id', organization_id,
        'user_id', user_id,
        'trial_ended_at', trial_ended_at
      ),
      user_id
    FROM consumed
    CROSS JOIN (VALUES ('billing.trial.consumed'), ('billing.plan.required')) AS e(event_name)
    WHERE organization_id IS NOT NULL
    RETURNING 1
  ),
  audits AS (
    INSERT INTO public.audit_logs (
      organization_id, user_id, entity_type, entity_id, action, new_data, metadata
    )
    SELECT
      organization_id, user_id, 'billing_trial_claims', id, 'billing_change',
      jsonb_build_object('status', 'consumed'),
      jsonb_build_object('event', 'trial_consumed', 'source', 'cron')
    FROM consumed
    WHERE organization_id IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_consumed FROM consumed;

  RETURN jsonb_build_object(
    'expired_subscriptions', v_expired_subs,
    'consumed_claims', v_consumed
  );
END;
$$;

COMMENT ON FUNCTION public.consume_expired_trials() IS
  'Cron sweep: expires overdue trialing subscriptions and marks their trial '
  'claims consumed, emitting billing.trial.consumed / billing.plan.required.';

REVOKE ALL ON FUNCTION public.consume_expired_trials() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_expired_trials() FROM anon;
REVOKE ALL ON FUNCTION public.consume_expired_trials() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_expired_trials() TO service_role;

-- ---------------------------------------------------------------------------
-- 8. refresh_trial_status() — ленивое погашение claim при рендере (027-путь):
--    как раньше персистит expired, плюс помечает claim consumed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_trial_status(p_organization_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_status TEXT;
BEGIN
  UPDATE public.billing_subscriptions bs
  SET status = 'expired', updated_at = now()
  FROM public.plans p
  WHERE bs.organization_id = p_organization_id
    AND bs.plan_id = p.id
    AND p.slug = 'trial'
    AND bs.status = 'trialing'
    AND bs.trial_ends_at <= now();

  -- Trial больше не активен → claim погашен (идемпотентно)
  UPDATE public.billing_trial_claims c
  SET status = 'consumed',
      trial_consumed_at = now(),
      trial_ended_at = COALESCE(c.trial_ended_at, now()),
      updated_at = now()
  WHERE c.organization_id = p_organization_id
    AND c.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.billing_subscriptions bs
      JOIN public.plans p ON p.id = bs.plan_id AND p.slug = 'trial'
      WHERE bs.organization_id = p_organization_id
        AND (bs.status IN ('expired', 'canceled') OR bs.trial_ends_at <= now())
    );

  SELECT status INTO v_status
  FROM public.billing_subscriptions
  WHERE organization_id = p_organization_id;

  RETURN COALESCE(v_status, 'active');
END;
$$;

COMMENT ON FUNCTION public.refresh_trial_status(UUID) IS
  'Persists an overdue trial as expired and marks the owner''s trial claim '
  'consumed; safe to call while rendering a signed-in organization.';
