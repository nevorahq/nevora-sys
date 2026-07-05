import "server-only";
import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import type { UserNotification } from "../types";
import { fetchUnreadNotifications } from "../services/fetch-user-notifications";

export async function getUnreadNotifications(limit = 20): Promise<UserNotification[]> {
  const context = await requireOrg();
  const supabase = await createClient();
  return fetchUnreadNotifications(supabase, context.org.id, limit);
}
