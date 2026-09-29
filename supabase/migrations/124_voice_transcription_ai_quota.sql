-- ============================================================
-- Migration 124: Meter voice-message transcription
-- ============================================================
-- ADR 002: a voice message sent to the Telegram bot is transcribed by a
-- speech-to-text model before it becomes an Inbox capture. That is a paid AI
-- call, so it records an ai_requests row first — exactly like capture_intent
-- (119): the BEFORE INSERT trigger start_limit_ai_requests (033/059) enforces
-- the shared monthly ai_calls quota on that insert, and a denied insert means
-- the voice message is not transcribed (the user is told why).
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
    'capture_intent',
    'voice_transcription'
  ));

COMMIT;

-- Verify:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'ai_requests_action_type_check';  -- includes voice_transcription
