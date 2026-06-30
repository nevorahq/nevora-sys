"use client";

import { useState, useTransition } from "react";
import { MoreHorizontalIcon, Trash2Icon, UsersRoundIcon } from "lucide-react";
import { removeMember } from "../actions/remove-member";
import { updateMemberRole } from "../actions/update-member-role";
import type { SettingsMember } from "../types/settings.types";

function formatLastActive(value: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export function MembersTable({ members, currentUserId, canManage }: { members: SettingsMember[]; currentUserId: string; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (members.length === 0) {
    return (
      <div className="soft-card-sm flex min-h-56 flex-col items-center justify-center px-6 text-center">
        <UsersRoundIcon size={28} className="text-text-muted" />
        <p className="mt-3 text-sm font-medium text-text-primary">No members yet</p>
        <p className="mt-1 text-sm text-text-muted">Invite your first teammate to this workspace.</p>
      </div>
    );
  }

  function changeRole(memberId: string, role: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateMemberRole(memberId, role);
      setMessage(result.error ?? result.success ?? null);
    });
  }

  function remove(member: SettingsMember) {
    if (!window.confirm(`Remove ${member.name || member.email || "this member"}?`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await removeMember(member.id);
      setMessage(result.error ?? result.success ?? null);
    });
  }

  return (
    <div>
      {message && <p className="mb-3 text-sm text-text-secondary" aria-live="polite">{message}</p>}
      <div className="overflow-x-auto rounded-(--neu-radius-md) border border-border-soft bg-surface-elevated">
        <table className="w-full min-w-185 text-left text-sm">
          <thead className="border-b border-border-soft bg-surface-sunken/50 text-xs uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last active</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {members.map((member) => {
              const isSelf = member.userId === currentUserId;
              const locked = !canManage || isSelf || member.role === "owner" || pending;
              return (
                <tr key={member.id}>
                  <td className="px-4 py-3 font-medium text-text-primary">{member.name || "Unnamed member"}{isSelf && <span className="ml-2 text-xs text-text-muted">You</span>}</td>
                  <td className="px-4 py-3 text-text-secondary">{member.email || "Unavailable"}</td>
                  <td className="px-4 py-3">
                    <select value={member.role} disabled={locked} onChange={(event) => changeRole(member.id, event.target.value)} className="rounded-md border border-border-soft bg-surface px-2 py-1.5 text-xs text-text-primary disabled:border-transparent disabled:opacity-100">
                      {member.role === "owner" && <option value="owner">Owner</option>}
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  </td>
                  <td className="px-4 py-3"><span className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs capitalize text-text-secondary">{member.status}</span></td>
                  <td className="px-4 py-3 text-text-muted">{formatLastActive(member.lastActiveAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {canManage && !isSelf && member.role !== "owner" ? (
                      <button type="button" onClick={() => remove(member)} disabled={pending} className="inline-flex items-center gap-1 text-xs font-medium text-danger hover:underline disabled:opacity-50"><Trash2Icon size={13} /> Remove</button>
                    ) : (
                      <MoreHorizontalIcon size={16} className="ml-auto text-text-muted" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
