"use server";

import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import { deliverNotification } from "@/modules/notifications/delivery/notification-delivery";

export async function sendTestNotification(): Promise<{ ok: boolean; message: string }> {
  const context = await requireOrg();
  const supabase = await createClient();
  const results = await deliverNotification(supabase, {
    organizationId: context.org.id,
    workspaceId: context.workspace.id,
    userId: context.user.id,
    title: "Nevora test notification",
    body: "Your notification settings are connected.",
    priority: "high",
    category: "action_center",
    targetUrl: "/dashboard/actions",
    deduplicationKey: `notification-test:${context.user.id}:${Date.now()}`,
  });
  const inApp = results.find((result) => result.channel === "in_app");
  return inApp?.status === "sent"
    ? { ok: true, message: "Test notification sent." }
    : { ok: false, message: "The test notification could not be created." };
}
