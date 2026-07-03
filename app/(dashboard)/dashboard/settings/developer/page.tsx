import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { DeveloperSettings } from "@/modules/developer/components/developer-settings";
import { getDeveloperOverview } from "@/modules/developer/queries/get-developer-overview";
import { SettingsAccessDenied } from "@/modules/settings/components/SettingsAccessDenied";
import { SettingsHeader } from "@/modules/settings/components/SettingsHeader";

export default async function DeveloperSettingsPage() {
  const ctx = await requireOrg();
  if (!canDo(ctx, "developer.view")) return <SettingsAccessDenied />;

  const overview = await getDeveloperOverview();

  return (
    <div className="space-y-5">
      <SettingsHeader title="Developer" description="Manage API keys, public API usage, and webhook foundations." />
      <DeveloperSettings overview={overview} />
    </div>
  );
}
