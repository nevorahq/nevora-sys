-- Organization FX + cross-currency transfer verification (migration 107).
-- Run after `supabase db reset`; all fixtures and mutations are rolled back.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF NOT COALESCE(ok, false) THEN RAISE EXCEPTION 'FX verification failed: %', message; END IF; END $$;
CREATE OR REPLACE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', p_user::text, true); END $$;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('a1070000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'fx-owner@example.test',  'x', now(), now(), now()),
  ('a1070000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'fx-admin@example.test',  'x', now(), now(), now()),
  ('a1070000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'fx-member@example.test', 'x', now(), now(), now()),
  ('a1070000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'fx-other@example.test',  'x', now(), now(), now());

INSERT INTO public.organizations (id, name, slug, plan, base_currency) VALUES
  ('b1070000-0000-4000-8000-000000000001', 'FX Org', 'fx-org-107', 'free', 'EUR'),
  ('b1070000-0000-4000-8000-000000000002', 'Other FX Org', 'other-fx-org-107', 'free', 'EUR');
INSERT INTO public.memberships (user_id, organization_id, role, status) VALUES
  ('a1070000-0000-4000-8000-000000000001', 'b1070000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('a1070000-0000-4000-8000-000000000002', 'b1070000-0000-4000-8000-000000000001', 'admin', 'active'),
  ('a1070000-0000-4000-8000-000000000003', 'b1070000-0000-4000-8000-000000000001', 'member', 'active'),
  ('a1070000-0000-4000-8000-000000000004', 'b1070000-0000-4000-8000-000000000002', 'owner', 'active');

INSERT INTO public.money_accounts
  (id, user_id, organization_id, name, type, initial_balance, currency, is_active)
VALUES
  ('c1070000-0000-4000-8000-000000000001', 'a1070000-0000-4000-8000-000000000001', 'b1070000-0000-4000-8000-000000000001', 'EUR Cash', 'cash', 500, 'EUR', true),
  ('c1070000-0000-4000-8000-000000000002', 'a1070000-0000-4000-8000-000000000001', 'b1070000-0000-4000-8000-000000000001', 'USD Bank', 'bank', 100, 'USD', true),
  ('c1070000-0000-4000-8000-000000000003', 'a1070000-0000-4000-8000-000000000001', 'b1070000-0000-4000-8000-000000000001', 'Inactive GBP', 'bank', 100, 'GBP', false),
  ('c1070000-0000-4000-8000-000000000004', 'a1070000-0000-4000-8000-000000000001', 'b1070000-0000-4000-8000-000000000001', 'ZZZ Custom', 'other', 0, 'ZZZ', true),
  ('c1070000-0000-4000-8000-000000000005', 'a1070000-0000-4000-8000-000000000004', 'b1070000-0000-4000-8000-000000000002', 'Other EUR', 'cash', 10, 'EUR', true),
  ('c1070000-0000-4000-8000-000000000006', 'a1070000-0000-4000-8000-000000000001', 'b1070000-0000-4000-8000-000000000001', 'EUR Savings', 'savings', 50, 'EUR', true);

-- Fixed global reference for priority checks.
INSERT INTO public.exchange_rates (quote_currency, rate_per_eur, as_of_date, source)
VALUES ('USD', 1.07000000, '2026-01-01', 'test')
ON CONFLICT (quote_currency, as_of_date) DO UPDATE SET rate_per_eur = EXCLUDED.rate_per_eur;

-- Superuser fixtures: two dated manual versions and a bank-only rate.
INSERT INTO public.organization_exchange_rates
  (id, organization_id, base_currency, quote_currency, rate, effective_date, source, rate_kind, created_by)
VALUES
  ('d1070000-0000-4000-8000-000000000001', 'b1070000-0000-4000-8000-000000000001', 'eur', 'usd', 1.0800, '2026-06-01', 'manual', 'mid', 'a1070000-0000-4000-8000-000000000001'),
  ('d1070000-0000-4000-8000-000000000002', 'b1070000-0000-4000-8000-000000000001', 'EUR', 'USD', 1.0845, '2026-07-01', 'manual', 'mid', 'a1070000-0000-4000-8000-000000000001'),
  ('d1070000-0000-4000-8000-000000000003', 'b1070000-0000-4000-8000-000000000002', 'EUR', 'USD', 9.9999, '2026-07-01', 'manual', 'mid', 'a1070000-0000-4000-8000-000000000004');

SELECT pg_temp.assert_true(
  (SELECT base_currency || '/' || quote_currency FROM public.organization_exchange_rates WHERE id = 'd1070000-0000-4000-8000-000000000001') = 'EUR/USD',
  'currencies must normalize to uppercase');

SET LOCAL ROLE authenticated;

-- Member can read own-org history, cannot read other org or mutate rates.
SELECT pg_temp.act_as('a1070000-0000-4000-8000-000000000003');
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.organization_exchange_rates) = 2,
  'RLS must expose only own-organization rates');
DO $$ BEGIN
  INSERT INTO public.organization_exchange_rates
    (organization_id, base_currency, quote_currency, rate, effective_date, source, rate_kind, created_by)
  VALUES ('b1070000-0000-4000-8000-000000000001', 'EUR', 'GBP', 0.85, '2026-07-01', 'manual', 'mid', 'a1070000-0000-4000-8000-000000000003');
  RAISE EXCEPTION 'member unexpectedly changed an FX rate';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

-- Admin can create a manual version, but cannot impersonate bank_api.
SELECT pg_temp.act_as('a1070000-0000-4000-8000-000000000002');
INSERT INTO public.organization_exchange_rates
  (organization_id, base_currency, quote_currency, rate, effective_date, source, rate_kind, created_by)
VALUES ('b1070000-0000-4000-8000-000000000001', 'EUR', 'GBP', 0.85, '2026-07-01', 'manual', 'mid', 'a1070000-0000-4000-8000-000000000002');
DO $$ BEGIN
  INSERT INTO public.organization_exchange_rates
    (organization_id, base_currency, quote_currency, rate, effective_date, source, rate_kind, created_by)
  VALUES ('b1070000-0000-4000-8000-000000000001', 'EUR', 'RON', 5, '2026-07-01', 'bank_api', 'mid', 'a1070000-0000-4000-8000-000000000002');
  RAISE EXCEPTION 'authenticated user unexpectedly wrote bank_api rate';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

-- Resolver: nearest dated manual wins over global and future versions.
SELECT pg_temp.assert_true(
  (SELECT round(rate, 4) FROM public.fn_resolve_organization_exchange_rate(
    'b1070000-0000-4000-8000-000000000001', 'EUR', 'USD', '2026-06-15')) = 1.0800,
  'resolver must use latest manual rate <= requested date');
SELECT pg_temp.assert_true(
  (SELECT source FROM public.fn_resolve_organization_exchange_rate(
    'b1070000-0000-4000-8000-000000000001', 'EUR', 'USD', '2026-07-10')) = 'manual',
  'manual organization rate must beat global rate');
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM public.fn_resolve_organization_exchange_rate(
    'b1070000-0000-4000-8000-000000000001', 'EUR', 'ZZZ', '2026-07-10')),
  'missing rate must return no row, never 1:1');

-- Authoritative RPC: 100 EUR -> 108.45 USD.
SELECT pg_temp.act_as('a1070000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true(
  position('user_id' in pg_get_functiondef(
    'public.create_money_transfer(uuid,uuid,uuid,uuid,numeric,numeric,date,text)'::regprocedure
  )) = 0,
  'transfer RPC must not depend on the removed money_transactions.user_id column');
CREATE TEMP TABLE same_currency_transfer AS
SELECT * FROM public.create_money_transfer(
  'b1070000-0000-4000-8000-000000000001', NULL,
  'c1070000-0000-4000-8000-000000000001', 'c1070000-0000-4000-8000-000000000006',
  25, NULL, '2026-07-10', NULL);
SELECT pg_temp.assert_true(
  (SELECT destination_amount = source_amount
      AND reference_exchange_rate = 1
      AND effective_exchange_rate = 1
      AND exchange_rate_source IS NULL
   FROM same_currency_transfer),
  'existing same-currency transfer semantics must remain unchanged');
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM public.money_transactions
    WHERE type = 'transfer'
      AND (destination_amount IS NULL OR destination_currency IS NULL
        OR reference_exchange_rate IS NULL OR effective_exchange_rate IS NULL)
  ),
  'all transfer rows must satisfy the migration backfill postcondition');

CREATE TEMP TABLE created_fx_transfer AS
SELECT * FROM public.create_money_transfer(
  'b1070000-0000-4000-8000-000000000001', NULL,
  'c1070000-0000-4000-8000-000000000001', 'c1070000-0000-4000-8000-000000000002',
  100, NULL, '2026-07-10', NULL);
SELECT pg_temp.assert_true(
  (SELECT destination_amount FROM created_fx_transfer) = 108.45,
  '100 EUR must credit 108.45 USD');
SELECT pg_temp.assert_true(
  (SELECT effective_exchange_rate FROM created_fx_transfer) = 1.0845,
  'effective rate must be snapshotted deterministically');

-- Reverse direction uses the inverse pivot rate and deterministic 2dp rounding.
CREATE TEMP TABLE reverse_fx_transfer AS
SELECT * FROM public.create_money_transfer(
  'b1070000-0000-4000-8000-000000000001', NULL,
  'c1070000-0000-4000-8000-000000000002', 'c1070000-0000-4000-8000-000000000001',
  100, NULL, '2026-07-10', NULL);
SELECT pg_temp.assert_true(
  (SELECT destination_amount FROM reverse_fx_transfer) = 92.21,
  'reverse USD -> EUR amount must round to 92.21');

-- Later rate changes do not rewrite the completed transfer snapshot.
UPDATE public.organization_exchange_rates SET rate = 1.2000
WHERE id = 'd1070000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE entity_type = 'organization_exchange_rates'
      AND entity_id = 'd1070000-0000-4000-8000-000000000002'
      AND action = 'update'
      AND (metadata ->> 'old_rate')::numeric = 1.0845
      AND (metadata ->> 'new_rate')::numeric = 1.2
  ),
  'same-date correction must atomically audit old and new rates');
SELECT pg_temp.assert_true(
  (SELECT destination_amount FROM public.money_transactions
   WHERE id = (SELECT id FROM created_fx_transfer)) = 108.45,
  'changing organization rate must not mutate an old transfer');
DO $$ BEGIN
  UPDATE public.money_transactions SET destination_amount = 999
  WHERE id = (SELECT id FROM created_fx_transfer);
  RAISE EXCEPTION 'posted transfer snapshot unexpectedly mutated';
EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL; END $$;

-- No reference rate: auto conversion fails, explicit actual amount is custom.
DO $$ BEGIN
  PERFORM public.create_money_transfer(
    'b1070000-0000-4000-8000-000000000001', NULL,
    'c1070000-0000-4000-8000-000000000001', 'c1070000-0000-4000-8000-000000000004',
    10, NULL, '2026-07-10', NULL);
  RAISE EXCEPTION 'missing rate unexpectedly became 1:1';
EXCEPTION WHEN invalid_parameter_value THEN NULL; END $$;
SELECT pg_temp.assert_true(
  (SELECT exchange_rate_source FROM public.create_money_transfer(
    'b1070000-0000-4000-8000-000000000001', NULL,
    'c1070000-0000-4000-8000-000000000001', 'c1070000-0000-4000-8000-000000000004',
    10, 7.25, '2026-07-10', NULL)) = 'custom',
  'explicit destination amount without reference must be marked custom');

-- Direct DB writes cannot use another org, inactive accounts, or forged currency.
DO $$ BEGIN
  INSERT INTO public.money_transactions
    (organization_id, created_by, updated_by, account_id, from_account_id, to_account_id, type,
     amount, currency, destination_amount, destination_currency,
     reference_exchange_rate, effective_exchange_rate, exchange_rate_source,
     transaction_date, title, status)
  VALUES
    ('b1070000-0000-4000-8000-000000000001',
     'a1070000-0000-4000-8000-000000000001', 'a1070000-0000-4000-8000-000000000001',
     'c1070000-0000-4000-8000-000000000001', 'c1070000-0000-4000-8000-000000000001',
     'c1070000-0000-4000-8000-000000000005', 'transfer', 1, 'EUR', 1, 'EUR', 1, 1, NULL,
     '2026-07-10', 'forged org', 'posted');
  RAISE EXCEPTION 'cross-org account unexpectedly accepted';
EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL; END $$;
DO $$ BEGIN
  PERFORM public.create_money_transfer(
    'b1070000-0000-4000-8000-000000000001', NULL,
    'c1070000-0000-4000-8000-000000000001', 'c1070000-0000-4000-8000-000000000003',
    1, 1, '2026-07-10', NULL);
  RAISE EXCEPTION 'inactive destination unexpectedly accepted';
EXCEPTION WHEN check_violation THEN NULL; END $$;
DO $$ BEGIN
  INSERT INTO public.money_transactions
    (organization_id, created_by, updated_by, account_id, from_account_id, to_account_id, type,
     amount, currency, destination_amount, destination_currency,
     reference_exchange_rate, effective_exchange_rate, exchange_rate_source,
     transaction_date, title, status)
  VALUES
    ('b1070000-0000-4000-8000-000000000001',
     'a1070000-0000-4000-8000-000000000001', 'a1070000-0000-4000-8000-000000000001',
     'c1070000-0000-4000-8000-000000000001', 'c1070000-0000-4000-8000-000000000001',
     'c1070000-0000-4000-8000-000000000002', 'transfer', 1, 'MDL', 1.08, 'USD', 1.08, 1.08, 'custom',
     '2026-07-10', 'forged currency', 'posted');
  RAISE EXCEPTION 'forged currency unexpectedly accepted';
EXCEPTION WHEN check_violation THEN NULL; END $$;

DO $$ BEGIN
  INSERT INTO public.money_transactions
    (organization_id, created_by, updated_by, account_id, type, amount, currency,
     destination_amount, destination_currency, transaction_date, title, status)
  VALUES
    ('b1070000-0000-4000-8000-000000000001',
     'a1070000-0000-4000-8000-000000000001', 'a1070000-0000-4000-8000-000000000001',
     'c1070000-0000-4000-8000-000000000001', 'expense', 1, 'EUR', 1, 'EUR',
     '2026-07-10', 'invalid expense snapshot', 'posted');
  RAISE EXCEPTION 'income/expense unexpectedly accepted transfer-only fields';
EXCEPTION WHEN check_violation THEN NULL; END $$;

RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'Migration 107 FX verification passed.'; END $$;
ROLLBACK;
