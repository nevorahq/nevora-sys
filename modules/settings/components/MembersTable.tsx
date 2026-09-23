"use client";

import { useState, useTransition } from "react";
import { MoreHorizontalIcon, Trash2Icon, UsersRoundIcon } from "lucide-react";
import { removeMember } from "../actions/remove-member";
import { updateMemberRole } from "../actions/update-member-role";
import { RestrictedActionTooltip, useAccessGate } from "@/modules/billing/components/access-state";
import type { SettingsMember } from "../types/settings.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";

export function MembersTable({ members, currentUserId, canManage, t, common }: { members: SettingsMember[]; currentUserId: string; canManage: boolean; t: Dictionary["settings"]["members"]; common: Dictionary["common"] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<SettingsMember | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const writeGate = useAccessGate("write");

  function formatLastActive(value: string | null) {
    if (!value) return t.notAvailable;
    return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
  }

  if (members.length === 0) {
    return (
      <div className="soft-card-sm flex min-h-56 flex-col items-center justify-center px-6 text-center">
        <UsersRoundIcon size={28} className="text-text-muted" />
        <p className="mt-3 text-sm font-medium text-text-primary">{t.empty}</p>
        <p className="mt-1 text-sm text-text-muted">{t.emptyHint}</p>
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

  function closeRemoveConfirmation() {
    setRemoveError(null);
    setMemberToRemove(null);
  }

  function confirmRemove() {
    if (!memberToRemove) return;
    const memberId = memberToRemove.id;
    setMessage(null);
    setRemoveError(null);
    startTransition(async () => {
      const result = await removeMember(memberId);
      if (result.error) {
        setRemoveError(result.error);
        return;
      }
      setMemberToRemove(null);
      setMessage(result.success ?? null);
    });
  }

  return (
    <div>
      {message && <p className="mb-3 text-sm text-text-secondary" aria-live="polite">{message}</p>}
      <div className="overflow-x-auto rounded-(--neu-radius-md) border border-border-soft bg-surface-elevated">
        <table className="w-full min-w-185 text-left text-sm">
          <thead className="border-b border-border-soft bg-surface-sunken/50 text-xs uppercase tracking-wide text-text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">{t.colName}</th>
              <th className="px-4 py-3 font-medium">{t.colEmail}</th>
              <th className="px-4 py-3 font-medium">{t.colRole}</th>
              <th className="px-4 py-3 font-medium">{t.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.colLastActive}</th>
              <th className="px-4 py-3 text-right font-medium">{t.colActions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {members.map((member) => {
              const isSelf = member.userId === currentUserId;
              const locked = !canManage || writeGate.blocked || isSelf || member.role === "owner" || pending;
              return (
                <tr key={member.id}>
                  <td className="px-4 py-3 font-medium text-text-primary">{member.name || t.unnamed}{isSelf && <span className="ml-2 text-xs text-text-muted">{t.you}</span>}</td>
                  <td className="px-4 py-3 text-text-secondary">{member.email || t.unavailable}</td>
                  <td className="px-4 py-3">
                    <select value={member.role} disabled={locked} title={writeGate.blocked ? writeGate.message : undefined} onChange={(event) => changeRole(member.id, event.target.value)} className="rounded-md border border-border-soft bg-surface px-2 py-1.5 text-xs text-text-primary disabled:border-transparent disabled:opacity-100">
                      {member.role === "owner" && <option value="owner">{t.roleOwner}</option>}
                      <option value="admin">{t.roleAdmin}</option>
                      <option value="member">{t.roleMember}</option>
                    </select>
                  </td>
                  <td className="px-4 py-3"><span className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs capitalize text-text-secondary">{member.status}</span></td>
                  <td className="px-4 py-3 text-text-muted">{formatLastActive(member.lastActiveAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {canManage && !isSelf && member.role !== "owner" ? (
                      <RestrictedActionTooltip message={writeGate.blocked ? writeGate.message : t.remove}>
                        <button type="button" onClick={() => setMemberToRemove(member)} disabled={pending || writeGate.blocked} className="inline-flex items-center gap-1 text-xs font-medium text-danger hover:underline disabled:cursor-not-allowed disabled:opacity-50"><Trash2Icon size={13} /> {t.remove}</button>
                      </RestrictedActionTooltip>
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

      <ConfirmDialog
        isOpen={memberToRemove !== null}
        onCancel={closeRemoveConfirmation}
        onConfirm={confirmRemove}
        title={t.removeConfirm.replace("{name}", memberToRemove?.name || memberToRemove?.email || t.thisMember)}
        description={t.removeConfirmDescription}
        confirmLabel={t.remove}
        pendingLabel={t.removing}
        cancelLabel={common.cancel}
        closeLabel={common.close}
        isPending={pending}
        error={removeError}
      />
    </div>
  );
}
