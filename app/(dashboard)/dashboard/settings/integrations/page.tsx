import { requireOrg } from "@/lib/auth/require-org";
import { createClient } from "@/lib/supabase/server";
import { SettingsHeader } from "@/modules/settings/components/SettingsHeader";
import { TelegramIntegrationCard } from "@/modules/channels/components/telegram-integration-card";
import { getMyChannelIntegration } from "@/modules/channels/queries/get-my-channel-integration";
import { getTelegramConfig } from "@/modules/channels/telegram/telegram-api";
import { getDictionary } from "@/shared/i18n/get-dictionary";

export default async function IntegrationsSettingsPage() {
  const [ctx, { dict }] = await Promise.all([requireOrg(), getDictionary()]);
  const telegram = getTelegramConfig();
  const integration = telegram ? await getMyChannelIntegration(await createClient(), ctx, "telegram") : null;
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
        <p className="text-sm text-text-muted">{t.comingSoon}</p>
      </div>
    </>
  );
}
