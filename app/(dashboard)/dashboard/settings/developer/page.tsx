import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { DeveloperSettings } from "@/modules/developer/components/developer-settings";
import { getDeveloperOverview } from "@/modules/developer/queries/get-developer-overview";
import { SettingsAccessDenied } from "@/modules/settings/components/SettingsAccessDenied";
import { SettingsHeader } from "@/modules/settings/components/SettingsHeader";
import { getDictionary } from "@/shared/i18n/get-dictionary";

export default async function DeveloperSettingsPage() {
  const ctx = await requireOrg();
  if (!canDo(ctx, "developer.view")) return <SettingsAccessDenied />;

  const [overview, { dict }] = await Promise.all([getDeveloperOverview(), getDictionary()]);

  return (
    <div className="space-y-5">
      <SettingsHeader title={dict.settings.header.developerTitle} description={dict.settings.header.developerDescription} />
      <DeveloperSettings overview={overview} />
    </div>
  );
}
