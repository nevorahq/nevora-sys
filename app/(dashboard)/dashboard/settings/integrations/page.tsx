import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import { SettingsHeader } from "@/modules/settings/components/SettingsHeader";
import { TelegramIntegrationCard } from "@/modules/channels/components/telegram-integration-card";
import { EmailIntegrationCard } from "@/modules/channels/components/email-integration-card";
import { getMyEmailForwarding } from "@/modules/channels/queries/get-my-email-forwarding";
import { getEmailChannelConfig } from "@/modules/channels/email/resend-inbound";
import { getMyChannelIntegration } from "@/modules/channels/queries/get-my-channel-integration";
import { getTelegramConfig } from "@/modules/channels/telegram/telegram-api";
import { getDictionary } from "@/shared/i18n/get-dictionary";

export default async function IntegrationsSettingsPage() {
  const [ctx, { dict }] = await Promise.all([requireOrg(), getDictionary()]);
  const telegram = getTelegramConfig();
  const email = getEmailChannelConfig();
  const supabase = await createClient();
  const [integration, forwarding] = await Promise.all([
    telegram ? getMyChannelIntegration(supabase, ctx, "telegram") : null,
    email ? getMyEmailForwarding(supabase, ctx, email.domain) : null,
  ]);
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
        <p className="text-sm text-text-muted">{t.comingSoon}</p>
      </div>
    </>
  );
}
