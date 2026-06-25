-- ============================================================
-- Migration 037: завершение SECURITY DEFINER grant hardening (P0)
-- ============================================================
-- Продолжение 035. Полный inventory всех функций public-схемы и явная
-- модель GRANT EXECUTE. По умолчанию Postgres выдаёт EXECUTE роли PUBLIC,
-- поэтому любая функция без явного REVOKE вызываема anon/authenticated.
--
-- ── Классификация ───────────────────────────────────────────────────────
--
-- A. PUBLIC (anon + authenticated) — намеренно вызываемы анонимно:
--      • create_booking_request_public(...)            [гранты в 035]
--      • check_client_booking_conflict_public(...)     [гранты в 035]
--      • get_invite_info(TEXT)                          ← фиксируем здесь
--    (Это НЕ единственные публичные SECURITY DEFINER RPC: get_invite_info
--     отдаёт инфо об инвайте по токену на публичной странице /invite/<token>.)
--      • check_rate_limit(...) — ПЕРЕВЕДЕНА в service-role-only (см. 038).
--
-- B. AUTHENTICATED-ONLY — RPC из server actions под сессией; внутри сами
--    валидируют auth.uid()/членство. Отзываем PUBLIC+anon, грантим authenticated:
--      • create_organization(TEXT,TEXT)                [гранты в 035]
--      • create_default_crm_pipeline(UUID)             [гранты в 035]
--      • refresh_trial_status(UUID)
--      • invite_member(UUID,TEXT,TEXT)
--      • accept_invite(UUID), decline_invite(UUID)
--      • create_invite_link(UUID,TEXT), accept_invite_link(TEXT)
--      • get_org_member_contact_details(UUID)
--
-- C. INTERNAL-ONLY — вызываются только триггерами или из других SECURITY
--    DEFINER функций (под ролью владельца). Клиентский EXECUTE не нужен,
--    отзываем у PUBLIC/anon/authenticated. Для trigger-функций это безопасно:
--    Postgres НЕ проверяет EXECUTE при срабатывании триггера.
--      • init_trial_subscription(UUID), init_free_subscription(UUID) [035]
--      • organization_plan_limit(UUID,TEXT)
--      • trigger-функции: handle_updated_at, handle_new_user,
--        sync_task_status_completed, mirror_task_relation,
--        snapshot_document_on_publish, auto_create_booking_page,
--        auto_create_booking_page_on_slug, sync_booking_page_org_slug,
--        enforce_plan_insert_limit, create_next_monthly_task
--
-- D. RLS-HELPERS — вызываются ВНУТРИ выражений RLS-политик при запросах
--    anon/authenticated, поэтому EXECUTE этим ролям НЕОБХОДИМ. Оставляем на
--    дефолтном PUBLIC grant НАМЕРЕННО (закрытие сломало бы RLS):
--      • current_user_id/current_organization_id/current_membership/current_role
--      • is_org_member/is_org_admin/is_org_owner
--      • can_manage_users/can_manage_billing/can_manage_workspace/
--        can_write_data/can_delete_data
--      • is_organization_writable(UUID)         (WITH CHECK на записи)
--      • org_has_other_active_owner(UUID,UUID)  (DELETE-политика memberships)
--
-- E. SECURITY INVOKER — выполняются с правами вызывающего, RLS применяется,
--    эскалации нет. Не трогаем:
--      • emit_domain_event(...), emit_audit_log(...), get_org_money_summary(UUID),
--        и INVOKER trigger-функции (handle_updated_at и пр. — всё равно
--        отзываем в C как defense-in-depth, т.к. напрямую звать их незачем).
-- ============================================================


-- ── A. Публичный invite RPC: явный grant вместо дефолтного PUBLIC ────────
REVOKE ALL ON FUNCTION public.get_invite_info(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invite_info(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.get_invite_info(TEXT) IS
  'PUBLIC SECURITY DEFINER RPC: инфо об инвайте по токену для /invite/<token>. '
  'Токен — секрет; прямой доступ к таблице инвайтов не выдаётся. EXECUTE: anon + authenticated.';


-- ── B. Authenticated-only RPC ───────────────────────────────────────────
DO $$
DECLARE
  fn TEXT;
  fns TEXT[] := ARRAY[
    'public.refresh_trial_status(UUID)',
    'public.invite_member(UUID, TEXT, TEXT)',
    'public.accept_invite(UUID)',
    'public.decline_invite(UUID)',
    'public.create_invite_link(UUID, TEXT)',
    'public.accept_invite_link(TEXT)',
    'public.get_org_member_contact_details(UUID)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC;', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated;', fn);
  END LOOP;
END $$;


-- ── C. Internal-only: trigger-функции и приватные helper'ы ───────────────
DO $$
DECLARE
  fn TEXT;
  fns TEXT[] := ARRAY[
    -- trigger-функции (EXECUTE при срабатывании триггера не проверяется):
    'public.handle_updated_at()',
    'public.handle_new_user()',
    'public.sync_task_status_completed()',
    'public.mirror_task_relation()',
    'public.snapshot_document_on_publish()',
    'public.auto_create_booking_page()',
    'public.auto_create_booking_page_on_slug()',
    'public.sync_booking_page_org_slug()',
    'public.enforce_plan_insert_limit()',
    'public.create_next_monthly_task()',
    -- приватный helper, вызывается только из enforce_plan_insert_limit:
    'public.organization_plan_limit(UUID, TEXT)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC;', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon;', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated;', fn);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.organization_plan_limit(UUID, TEXT) IS
  'INTERNAL-ONLY helper плановых лимитов. Вызывается только из триггера '
  'enforce_plan_insert_limit под ролью владельца. EXECUTE отозван у клиентов.';


-- ── D. RLS-helpers — оставлены на дефолтном grant НАМЕРЕННО ──────────────
-- (документируем причину; не выполняем REVOKE, иначе RLS-проверки anon/
--  authenticated начнут падать с permission denied на сами helper-функции.)
COMMENT ON FUNCTION public.is_org_member(UUID) IS
  'RLS-helper (используется в 48 политиках). EXECUTE остаётся доступен anon/'
  'authenticated — это обязательное условие вычисления RLS-выражений.';
