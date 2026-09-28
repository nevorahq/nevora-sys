/** External channels that feed the Capture Inbox (ADR 002). Mirrors migration 121. */
export const CHANNELS = ["telegram", "slack", "email"] as const;
export type Channel = (typeof CHANNELS)[number];

/** A linked external account (channel_integrations row). */
export interface ChannelIntegration {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  user_id: string;
  channel: Channel;
  external_user_id: string;
  external_chat_id: string | null;
  external_username: string | null;
  status: "active" | "revoked";
  created_at: string;
}

export const CHANNEL_INTEGRATION_COLUMNS =
  "id, organization_id, workspace_id, user_id, channel, external_user_id, external_chat_id, external_username, status, created_at" as const;

/** The sender as the channel identifies them. */
export interface ExternalSender {
  userId: string;
  chatId: string | null;
  username: string | null;
}
