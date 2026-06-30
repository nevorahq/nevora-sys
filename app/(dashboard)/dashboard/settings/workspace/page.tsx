import { requireOrg } from "@/lib/auth/require-org";
import { getWorkspaceSettings } from "@/modules/settings/queries/get-workspace-settings";
import { hasSettingsPermission } from "@/modules/settings/utils/settings-permissions";
import { WorkspaceForm } from "@/modules/settings/components/WorkspaceForm";
import { SettingsHeader } from "@/modules/settings/components/SettingsHeader";
import { SettingsAccessDenied } from "@/modules/settings/components/SettingsAccessDenied";

export default async function WorkspaceSettingsPage() {
  const context = await requireOrg();
  if (!hasSettingsPermission(context, "workspace.read")) return <SettingsAccessDenied />;
  const workspace = await getWorkspaceSettings();
  return (
    <>
      <SettingsHeader title="Workspace" description="Configure the organization defaults shared by your team." />
      <WorkspaceForm workspace={workspace} />
    </>
  );
}
