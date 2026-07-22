-- Job-health diagnostic indexes.
--
-- `/api/internal/job-health` performs cross-organization exact head counts. The
-- existing tenant-prefixed indexes cannot serve those global status/time-window
-- predicates, so keep the operational query bounded with small partial indexes.

CREATE INDEX IF NOT EXISTS reminder_schedules_processing_last_attempt_idx
  ON public.reminder_schedules (last_attempt_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS reminder_schedules_failed_last_attempt_idx
  ON public.reminder_schedules (last_attempt_at)
  WHERE status = 'failed';

CREATE INDEX IF NOT EXISTS document_extractions_processing_started_idx
  ON public.document_extractions (started_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS automation_audit_logs_failed_created_idx
  ON public.automation_audit_logs (created_at)
  WHERE status = 'failed';
