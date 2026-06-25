import { CrownIcon, ShieldCheckIcon, UserRoundIcon, UsersRoundIcon } from "lucide-react";
import type { OrgMemberRow } from "@/modules/members";
import { RemoveMemberButton } from "./remove-member-button";

const STATUS: Record<OrgMemberRow["status"], { label: string; className: string }> = {
  active: { label: "Active", className: "bg-accent-green-soft/50 text-text-primary" },
  invited: { label: "Invitation pending", className: "bg-accent-yellow-soft/60 text-text-primary" },
  suspended: { label: "Suspended", className: "bg-surface-sunken text-text-muted" },
};

function initials(name: string | null) {
  if (!name?.trim()) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function MembersList({
  members,
  currentUserId,
  canManage,
}: {
  members: OrgMemberRow[];
  currentUserId: string;
  canManage: boolean;
}) {
  if (members.length === 0) {
    return (
      <div className="soft-card-sm flex flex-col items-center px-6 py-12 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken text-text-muted">
          <UsersRoundIcon size={20} />
        </span>
        <p className="mt-3 text-sm font-medium text-text-primary">No members yet</p>
        <p className="mt-1 max-w-sm text-sm text-text-muted">Invite a teammate to start working together in this workspace.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-(--neu-radius-md) border border-border-soft bg-surface-primary">
      <ul className="divide-y divide-border-soft">
        {members.map((member) => {
          const status = STATUS[member.status];
          const isOwner = member.role === "owner";
          const isCurrentUser = member.userId === currentUserId;
          const addedLabel = member.status === "invited" ? "Invited" : "Member since";

          return (
            <li key={member.id} className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-sm font-semibold text-text-secondary">
                  {initials(member.displayName)}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {member.displayName?.trim() || "Unnamed member"}
                    </p>
                    {isCurrentUser && <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-text-muted">You</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {member.email ?? "Email unavailable"}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {addedLabel} {new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(member.createdAt))}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                <span className="flex items-center gap-1 text-xs text-text-secondary">
                  {isOwner ? <CrownIcon size={13} className="text-accent-yellow" /> : member.role === "admin" ? <ShieldCheckIcon size={13} /> : <UserRoundIcon size={13} />}
                  {roleLabel(member.role)}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${status.className}`}>{status.label}</span>
                {canManage && !isCurrentUser && !isOwner && (
                  <RemoveMemberButton
                    memberId={member.id}
                    memberName={member.displayName?.trim() || member.email || "this member"}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
