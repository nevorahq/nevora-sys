-- ============================================================
-- Migration 119: Meter Capture Inbox intent detection
-- ============================================================
-- ADR 002, step 0.2. Every AI intent detection of an Inbox capture now records
-- an ai_requests row before the model call, like transaction categorization
-- (069). The BEFORE INSERT trigger start_limit_ai_requests (033/059) enforces
-- the shared monthly ai_calls quota on that insert; a rejected insert makes the
-- capture fall back to the no-AI normalizer instead of failing.
--
-- Only the action_type dictionary changes. Idempotent: safe to re-run.

BEGIN;

ALTER TABLE public.ai_requests
  DROP CONSTRAINT IF EXISTS ai_requests_action_type_check;

ALTER TABLE public.ai_requests
  ADD CONSTRAINT ai_requests_action_type_check
  CHECK (action_type IN (
    'summary',
    'insights',
    'recommendations',
    'document_extraction',
    'transaction_categorization',
    'capture_intent'
  ));

COMMIT;

-- Verify:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'ai_requests_action_type_check';  -- includes capture_intent
