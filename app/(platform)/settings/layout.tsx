import { AppShell } from "@/modules/app-shell/app-shell";
import SettingsSectionLayout from "@/app/(dashboard)/dashboard/settings/layout";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <SettingsSectionLayout>{children}</SettingsSectionLayout>
    </AppShell>
  );
}
