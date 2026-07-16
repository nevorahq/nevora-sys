import { requireOrg } from "@/lib/auth/require-org";
import { getWorkspaceSettings } from "@/modules/settings/queries/get-workspace-settings";
import { hasSettingsPermission } from "@/modules/settings/utils/settings-permissions";
import { WorkspaceForm } from "@/modules/settings/components/WorkspaceForm";
import { SettingsHeader } from "@/modules/settings/components/SettingsHeader";
import { SettingsAccessDenied } from "@/modules/settings/components/SettingsAccessDenied";
import { getDictionary } from "@/shared/i18n/get-dictionary";

export default async function WorkspaceSettingsPage() {
  const context = await requireOrg();
  if (!hasSettingsPermission(context, "workspace.read")) return <SettingsAccessDenied />;
  const [workspace, { dict }] = await Promise.all([getWorkspaceSettings(), getDictionary()]);
  const t = dict.settings;
  return (
    <>
      <SettingsHeader title={t.header.workspaceTitle} description={t.header.workspaceDescription} />
      <WorkspaceForm workspace={workspace} t={t} />
    </>
  );
}
