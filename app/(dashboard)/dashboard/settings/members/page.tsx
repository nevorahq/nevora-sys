import { requireOrg } from "@/lib/auth/require-org";
import { resolveAccountLimits } from "@/lib/billing";
import { getMembers } from "@/modules/settings/queries/get-members";
import { hasSettingsPermission } from "@/modules/settings/utils/settings-permissions";
import { SettingsHeader } from "@/modules/settings/components/SettingsHeader";
import { SettingsAccessDenied } from "@/modules/settings/components/SettingsAccessDenied";
import { MembersTable } from "@/modules/settings/components/MembersTable";
import { InviteMemberDialog } from "@/modules/settings/components/InviteMemberDialog";
import { PendingInvitesCard, getPendingInvites } from "@/modules/members";

export default async function MembersPage() {
  const context = await requireOrg();
  if (!hasSettingsPermission(context, "members.read")) return <SettingsAccessDenied />;

  const [members, limits, pendingInvites] = await Promise.all([
    getMembers(),
    resolveAccountLimits(context.user.id, context.org.id),
    getPendingInvites(),
  ]);

  const maxMembers = limits.maxMembers;
  const unlimited = maxMembers === null;
  // Места считаются как active + invited (pending-invite держит место)
  const seatCount = members.filter((member) => member.status !== "disabled").length;
  const limitReached = maxMembers !== null && seatCount >= maxMembers;
  const canManage = hasSettingsPermission(context, "members.update_role");

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <SettingsHeader title="Members" description="Invite teammates, manage access, and review pending invitations." />
        {canManage && <InviteMemberDialog limitReached={limitReached} limitReason={unlimited ? undefined : `Your plan supports up to ${maxMembers} members.`} />}
      </div>
      {pendingInvites.length > 0 && (
        <div className="mb-4">
          <PendingInvitesCard invites={pendingInvites} />
        </div>
      )}
      <div className="mb-4 text-sm text-text-secondary">{seatCount} {unlimited ? "members" : `of ${maxMembers} seats used`}</div>
      <MembersTable members={members} currentUserId={context.user.id} canManage={canManage} />
    </>
  );
}
