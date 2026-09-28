import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { CHANNEL_INTEGRATION_COLUMNS, type Channel, type ChannelIntegration } from "../types";

/**
 * The signed-in user's active integration on a channel, or null. Tolerates a
 * database without migration 121 (the table is missing) by returning null.
 */
export async function getMyChannelIntegration(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  channel: Channel,
): Promise<ChannelIntegration | null> {
  const { data, error } = await supabase
    .from("channel_integrations")
    .select(CHANNEL_INTEGRATION_COLUMNS)
    .eq("organization_id", ctx.org.id)
    .eq("user_id", ctx.user.id)
    .eq("channel", channel)
    .eq("status", "active")
    .maybeSingle();
  if (error) return null;
  return (data as ChannelIntegration | null) ?? null;
}
