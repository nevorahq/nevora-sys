import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush, { type WebPushError } from "web-push";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";
import { DEFAULT_NOTIFICATION_PREFERENCES, isCategoryEnabled, isWithinQuietHours } from "../preferences";
import type { NotificationCategory, NotificationPreferences, NotificationPriority } from "../types";
import { createPushPayload } from "./push-payload";

export interface DeliverNotificationInput {
  organizationId: string;
  workspaceId?: string | null;
  userId: string;
  title: string;
  body: string;
  priority: NotificationPriority;
  category: NotificationCategory;
  targetUrl?: string;
  deduplicationKey: string;
  actionItemId?: string;
}

export interface DeliveryResult {
  notificationId?: string;
  channel: "in_app" | "push";
  status: "sent" | "skipped" | "failed";
  reason?: string;
}

export async function deliverNotification(
  supabase: SupabaseClient,
  input: DeliverNotificationInput,
): Promise<DeliveryResult[]> {
  const log = logger.child({ organizationId: input.organizationId, userId: input.userId });
  const { data: notification, error } = await supabase.from("notifications").insert({
    organization_id: input.organizationId,
    workspace_id: input.workspaceId ?? null,
    user_id: input.userId,
    type: input.category,
    title: input.title,
    body: input.body,
    action_item_id: input.actionItemId ?? null,
    category: input.category,
    priority: input.priority,
    target_url: normalizeTarget(input.targetUrl),
    deduplication_key: input.deduplicationKey,
  }).select("id").single();

  if (error || !notification) {
    const duplicate = error?.code === "23505";
    log[duplicate ? "info" : "error"]("notification.delivery.insert", { result: duplicate ? "skipped" : "failed", reason: error?.code ?? "missing_row" });
    return [
      { channel: "in_app", status: duplicate ? "skipped" : "failed", reason: duplicate ? "duplicate" : "insert_failed" },
      { channel: "push", status: "skipped", reason: duplicate ? "duplicate" : "notification_unavailable" },
    ];
  }

  const notificationId = notification.id as string;
  const inApp: DeliveryResult = { notificationId, channel: "in_app", status: "sent" };
  await recordDelivery(supabase, input, notificationId, inApp);

  const push = await deliverPush(input, notificationId);
  await recordDelivery(supabase, input, notificationId, push);
  log.info("notification.delivery.complete", { notificationId, inApp: inApp.status, push: push.status, pushReason: push.reason });
  return [inApp, { ...push, notificationId }];
}

async function deliverPush(input: DeliverNotificationInput, notificationId: string): Promise<DeliveryResult> {
  const service = getServiceRoleClient();
  if (!service) return { channel: "push", status: "skipped", reason: "service_role_unconfigured" };

  const { data: membership } = await service.from("memberships").select("id")
    .eq("organization_id", input.organizationId).eq("user_id", input.userId).eq("status", "active").maybeSingle();
  if (!membership) return { channel: "push", status: "skipped", reason: "inactive_membership" };

  const { data: row } = await service.from("user_notification_preferences")
    .select("browser_notifications_enabled, in_app_sound_enabled, sound_mode, sound_volume, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone, task_reminders_enabled, subscription_reminders_enabled, payment_reminders_enabled, document_review_enabled, action_center_enabled")
    .eq("organization_id", input.organizationId).eq("user_id", input.userId).maybeSingle();
  const preferences = row ? mapPreferences(row) : DEFAULT_NOTIFICATION_PREFERENCES;
  if (!preferences.browserNotificationsEnabled) return { channel: "push", status: "skipped", reason: "disabled" };
  if (!isCategoryEnabled(preferences, input.category)) return { channel: "push", status: "skipped", reason: "category_disabled" };
  if (isWithinQuietHours(new Date(), preferences)) return { channel: "push", status: "skipped", reason: "quiet_hours" };

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return { channel: "push", status: "skipped", reason: "vapid_unconfigured" };
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch {
    return { channel: "push", status: "skipped", reason: "vapid_invalid" };
  }

  const { data: subscriptions } = await service.from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("organization_id", input.organizationId).eq("user_id", input.userId);
  if (!subscriptions?.length) return { channel: "push", status: "skipped", reason: "no_subscription" };

  let sent = 0;
  let failed = 0;
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint as string,
        keys: { p256dh: subscription.p256dh as string, auth: subscription.auth_key as string },
      }, JSON.stringify(createPushPayload({
        title: "Nevora reminder",
        body: "You have a new item in Action Center.",
        tag: input.deduplicationKey.slice(0, 200),
        url: normalizeTarget(input.targetUrl),
        notificationId,
      })), { TTL: 60 * 60 });
      sent += 1;
      await service.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", subscription.id);
    } catch (error) {
      failed += 1;
      const statusCode = (error as WebPushError).statusCode;
      if (isPermanentPushFailure(statusCode)) {
        await service.from("push_subscriptions").delete().eq("id", subscription.id);
      }
    }
  }));
  if (sent > 0) return { channel: "push", status: "sent", reason: failed > 0 ? "partial_failure" : undefined };
  return { channel: "push", status: "failed", reason: "all_subscriptions_failed" };
}

export function isPermanentPushFailure(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

async function recordDelivery(supabase: SupabaseClient, input: DeliverNotificationInput, notificationId: string, result: DeliveryResult) {
  await supabase.from("notification_deliveries").insert({
    organization_id: input.organizationId,
    user_id: input.userId,
    notification_id: notificationId,
    channel: result.channel,
    idempotency_key: `${input.deduplicationKey}:${result.channel}`,
    status: result.status,
    failure_reason: result.reason ?? null,
  });
}

function normalizeTarget(value?: string): string {
  return value?.startsWith("/dashboard/") && !value.startsWith("//") ? value : "/dashboard/actions";
}

function mapPreferences(row: Record<string, unknown>): NotificationPreferences {
  return {
    browserNotificationsEnabled: Boolean(row.browser_notifications_enabled),
    inAppSoundEnabled: Boolean(row.in_app_sound_enabled),
    soundMode: row.sound_mode as NotificationPreferences["soundMode"],
    soundVolume: Number(row.sound_volume),
    quietHoursEnabled: Boolean(row.quiet_hours_enabled),
    quietHoursStart: String(row.quiet_hours_start).slice(0, 5),
    quietHoursEnd: String(row.quiet_hours_end).slice(0, 5),
    timezone: String(row.timezone),
    taskRemindersEnabled: Boolean(row.task_reminders_enabled),
    subscriptionRemindersEnabled: Boolean(row.subscription_reminders_enabled),
    paymentRemindersEnabled: Boolean(row.payment_reminders_enabled),
    documentReviewEnabled: Boolean(row.document_review_enabled),
    actionCenterEnabled: Boolean(row.action_center_enabled),
  };
}
