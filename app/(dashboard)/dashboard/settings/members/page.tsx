import { requireOrg } from "@/lib/auth/require-org";
import { getSubscription, UNLIMITED } from "@/modules/billing";
import { getMembers } from "@/modules/members";
import { CreateInviteLink } from "@/features/members/components/create-invite-link";
import { MembersList } from "@/features/members/components/members-list";

export default async function MembersPage() {
  const { org, membership } = await requireOrg();

  const [members, subscription] = await Promise.all([
    getMembers(org.id),
    getSubscription(org.id),
  ]);

  const maxMembers = subscription?.plan?.max_members ?? UNLIMITED;
  const unlimited = maxMembers === UNLIMITED;
  // Места считаются как active + invited (pending-invite держит место)
  const seatCount = members.filter((m) => m.status !== "suspended").length;
  const limitReached = !unlimited && seatCount >= maxMembers;
  const canManage = ["owner", "admin"].includes(membership.roleId);

  return (
    <>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Members</h1>
        <p className="mt-1 text-sm text-text-muted">
          Invite teammates and manage access
        </p>
      </div>

      {/* Seat usage */}
      <section className="mt-6">
        <div className="soft-card-sm inline-flex items-center gap-2 px-4 py-2 text-sm">
          <span className="font-medium text-text-primary">Members:</span>
          <span className="text-text-secondary">
            {seatCount} {unlimited ? "" : `of ${maxMembers}`}
          </span>
        </div>
      </section>

      {/* Invite */}
      {canManage && (
        <section className="mt-6 max-w-xl">
          <CreateInviteLink
            limitReached={limitReached}
            limitReason={
              unlimited
                ? undefined
                : `Your plan supports up to ${maxMembers} members. For a bigger team, choose Pro or Business.`
            }
          />
        </section>
      )}

      {/* Members list */}
      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-secondary">
          Team
        </h2>
        <MembersList
          members={members}
          currentUserId={membership.userId}
          canManage={canManage}
        />
      </section>
    </>
  );
}
