import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { logger } from "@/lib/observability/logger";
import { normalizeUnreadCount } from "../unread-count";

export async function getUnreadNotificationCount(): Promise<number> {
  const context = await requireOrg();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_unread_notification_count", {
    p_organization_id: context.org.id,
  });
  if (error) {
    logger.warn("notification.unread_count_failed", {
      organizationId: context.org.id,
      userId: context.user.id,
      reason: error.code,
    });
    return 0;
  }
  return normalizeUnreadCount(data);
}
