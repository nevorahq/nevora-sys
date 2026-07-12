import { getProfile } from "@/modules/settings/queries/get-profile";
import { getPendingAccountDeletion } from "@/modules/settings/queries/get-account-deletion-status";
import { ProfileForm } from "@/modules/settings/components/ProfileForm";
import { DeleteAccountSection } from "@/modules/settings/components/DeleteAccountSection";
import { SettingsHeader } from "@/modules/settings/components/SettingsHeader";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@/modules/settings/config/account-deletion";
import { createClient } from "@/lib/supabase/server";

export default async function ProfileSettingsPage() {
  const [profile, pendingDeletion] = await Promise.all([
    getProfile(),
    getPendingAccountDeletion(),
  ]);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const hasPassword = (user?.identities ?? []).some((i) => i.provider === "email");

  return (
    <>
      <SettingsHeader title="Profile" description="Manage your personal details and regional preferences." />
      <ProfileForm profile={profile} />
      <div className="mt-8">
        <DeleteAccountSection
          email={profile.email}
          graceDays={ACCOUNT_DELETION_GRACE_DAYS}
          hasPassword={hasPassword}
          pending={pendingDeletion ? { purgeAfter: pendingDeletion.purgeAfter } : null}
        />
      </div>
    </>
  );
}
