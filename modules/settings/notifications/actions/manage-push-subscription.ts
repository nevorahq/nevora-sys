"use server";

import { headers } from "next/headers";
import { requireOrg } from "@/lib/auth/require-org";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { pushSubscriptionSchema } from "../schemas/notification-preferences.schema";

export async function registerPushSubscription(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The browser returned an invalid push subscription." };
  const context = await requireOrg();
  const supabase = getServiceRoleClient();
  if (!supabase) return { ok: false, error: "Push storage is not configured on this deployment." };
  const headerStore = await headers();
  const { error } = await supabase.from("push_subscriptions").upsert({
    organization_id: context.org.id,
    user_id: context.user.id,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth_key: parsed.data.keys.auth,
    expires_at: parsed.data.expirationTime ? new Date(parsed.data.expirationTime).toISOString() : null,
    user_agent: headerStore.get("user-agent")?.slice(0, 500) ?? null,
    last_used_at: new Date().toISOString(),
  }, { onConflict: "user_id,endpoint" });
  return error ? { ok: false, error: "Could not save this browser subscription." } : { ok: true };
}

export async function removePushSubscription(endpoint: unknown): Promise<{ ok: boolean; error?: string }> {
  if (typeof endpoint !== "string" || endpoint.length > 4096) return { ok: false, error: "Invalid subscription." };
  const context = await requireOrg();
  const supabase = getServiceRoleClient();
  if (!supabase) return { ok: false, error: "Push storage is not configured on this deployment." };
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("organization_id", context.org.id)
    .eq("user_id", context.user.id)
    .eq("endpoint", endpoint);
  return error ? { ok: false, error: "Could not remove this browser subscription." } : { ok: true };
}
