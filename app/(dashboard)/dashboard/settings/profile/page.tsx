import { getProfile } from "@/modules/settings/queries/get-profile";
import { ProfileForm } from "@/modules/settings/components/ProfileForm";
import { SettingsHeader } from "@/modules/settings/components/SettingsHeader";

export default async function ProfileSettingsPage() {
  const profile = await getProfile();
  return (
    <>
      <SettingsHeader title="Profile" description="Manage your personal details and regional preferences." />
      <ProfileForm profile={profile} />
    </>
  );
}
