import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { formatInboxAddress } from "../email/inbound-address";
import { getMyChannelIntegration } from "./get-my-channel-integration";

export interface MyEmailForwarding {
  address: string;
  confirmation: { code: string | null; link: string | null } | null;
}

/**
 * The signed-in user's forwarding address and a pending Gmail confirmation.
 * The metadata column (migration 123) is read on its own, so a database
 * without it still shows the address.
 */
export async function getMyEmailForwarding(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  domain: string,
): Promise<MyEmailForwarding | null> {
  const integration = await getMyChannelIntegration(supabase, ctx, "email");
  if (!integration) return null;

  const { data } = await supabase.from("channel_integrations").select("metadata").eq("id", integration.id).maybeSingle();
  const stored = (data as { metadata?: { forwarding_confirmation?: { code?: unknown; link?: unknown } } } | null)?.metadata
    ?.forwarding_confirmation;
  const code = typeof stored?.code === "string" ? stored.code : null;
  const link = typeof stored?.link === "string" && stored.link.startsWith("https://") ? stored.link : null;

  return {
    address: formatInboxAddress(integration.external_user_id, domain),
    confirmation: code || link ? { code, link } : null,
  };
}
