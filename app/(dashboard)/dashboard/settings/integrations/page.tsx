import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import { SettingsHeader } from "@/modules/settings/components/SettingsHeader";
import { TelegramIntegrationCard } from "@/modules/channels/components/telegram-integration-card";
import { EmailIntegrationCard } from "@/modules/channels/components/email-integration-card";
import { SlackIntegrationCard } from "@/modules/channels/components/slack-integration-card";
import { getMySlackIntegration } from "@/modules/channels/queries/get-my-slack-integration";
import { getSlackConfig } from "@/modules/channels/slack/slack-api";
import { SLACK_CONNECT_RESULTS, type SlackConnectResult } from "@/modules/channels/slack/slack-oauth";
import { getMyEmailForwarding } from "@/modules/channels/queries/get-my-email-forwarding";
import { getEmailChannelConfig } from "@/modules/channels/email/resend-inbound";
import { getMyChannelIntegration } from "@/modules/channels/queries/get-my-channel-integration";
import { getTelegramConfig } from "@/modules/channels/telegram/telegram-api";
import { getDictionary } from "@/shared/i18n/get-dictionary";

export default async function IntegrationsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [ctx, { dict }, params] = await Promise.all([requireOrg(), getDictionary(), searchParams]);
  const telegram = getTelegramConfig();
  const email = getEmailChannelConfig();
  const slack = getSlackConfig();
  const supabase = await createClient();
  const [integration, forwarding, slackIntegration] = await Promise.all([
    telegram ? getMyChannelIntegration(supabase, ctx, "telegram") : null,
    email ? getMyEmailForwarding(supabase, ctx, email.domain) : null,
    slack ? getMySlackIntegration(supabase, ctx) : null,
  ]);
  // The OAuth callback's outcome (`?slack=`); anything else is ignored.
  const slackResult = SLACK_CONNECT_RESULTS.find((result): result is SlackConnectResult => result === params.slack) ?? null;
  const t = dict.channels.telegram.settings;

  return (
    <>
      <SettingsHeader title={dict.settings.header.integrationsTitle} description={dict.settings.header.integrationsDescription} />
      <div className="flex flex-col gap-4">
        <TelegramIntegrationCard
          t={t}
          configured={Boolean(telegram)}
          botUsername={telegram?.botUsername ?? null}
          connectedAs={integration ? (integration.external_username ? `@${integration.external_username}` : integration.external_user_id) : null}
        />
        <EmailIntegrationCard
          t={dict.channels.email.settings}
          configured={Boolean(email)}
          address={forwarding?.address ?? null}
          accountEmail={ctx.user.email ?? null}
          confirmation={forwarding?.confirmation ?? null}
        />
        <SlackIntegrationCard
          t={dict.channels.slack.settings}
          configured={Boolean(slack)}
          connected={Boolean(slackIntegration)}
          teamName={slackIntegration?.teamName ?? null}
          result={slackResult}
        />
      </div>
    </>
  );
}
