import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { getMyChannelIntegration } from "./get-my-channel-integration";

export interface MySlackIntegration {
  /** The Slack workspace (or Grid org) name recorded at install, if Slack sent one. */
  teamName: string | null;
}

/**
 * The signed-in user's Slack connection. The metadata column (migration 123)
 * is read on its own, so a database without it still shows "Connected".
 */
export async function getMySlackIntegration(supabase: SupabaseClient, ctx: CurrentContext): Promise<MySlackIntegration | null> {
  const integration = await getMyChannelIntegration(supabase, ctx, "slack");
  if (!integration) return null;

  const { data } = await supabase.from("channel_integrations").select("metadata").eq("id", integration.id).maybeSingle();
  const teamName = (data as { metadata?: { team_name?: unknown } } | null)?.metadata?.team_name;
  return { teamName: typeof teamName === "string" && teamName.trim() ? teamName.trim() : null };
}
