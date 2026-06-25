-- Immutable logs must survive user deletion. Their foreign keys already use
-- ON DELETE SET NULL, so the columns must permit NULL as well.
ALTER TABLE public.domain_events
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.audit_logs
  ALTER COLUMN user_id DROP NOT NULL;

-- Comments remain, but their deleted author is intentionally anonymized.
ALTER TABLE public.task_comments
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.document_comments
  ALTER COLUMN user_id DROP NOT NULL;
