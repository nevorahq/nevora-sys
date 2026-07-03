import "server-only";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";

export interface ReminderSweepResult {
  ok: boolean;
  delivered: number;
  skipped: number;
  failed: number;
  reason?: string;
}

export async function processDueReminders(limit = 50): Promise<ReminderSweepResult> {
  const service = getServiceRoleClient();
  if (!service) return { ok: false, delivered: 0, skipped: 0, failed: 0, reason: "service_role_unconfigured" };
  const { data, error } = await service.rpc("process_due_reminders", { p_limit: Math.min(Math.max(limit, 1), 200) });
  if (error) {
    logger.error("reminder.sweep_failed", { failureCode: error.code });
    return { ok: false, delivered: 0, skipped: 0, failed: 1, reason: error.code };
  }
  const result = (data ?? {}) as Record<string, unknown>;
  return { ok: true, delivered: Number(result.delivered) || 0, skipped: Number(result.skipped) || 0, failed: Number(result.failed) || 0 };
}
