import "server-only";
import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/observability/logger";
import { normalizeNotificationCounters } from "../counters";
import { EMPTY_NOTIFICATION_COUNTERS, type NotificationCounters } from "../types";

export async function getNotificationCounters(): Promise<NotificationCounters> {
  const context = await requireOrg();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_notification_counters", { p_organization_id: context.org.id });
  if (error) {
    logger.warn("notification.counters_failed", { organizationId: context.org.id, userId: context.user.id, reason: error.code });
    return { ...EMPTY_NOTIFICATION_COUNTERS };
  }
  return normalizeNotificationCounters(data);
}
