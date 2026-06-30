import { requireOrg } from "@/lib/auth/require-org";
import { SettingsSidebar } from "@/modules/settings/components/SettingsSidebar";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { membership } = await requireOrg();
  const canAdminister = ["owner", "admin"].includes(membership.roleId);

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">System</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-text-primary">Settings</h1>
      </div>
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <SettingsSidebar canAdminister={canAdminister} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
