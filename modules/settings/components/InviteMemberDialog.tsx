"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { UserPlusIcon } from "lucide-react";
import { inviteMember } from "../actions/invite-member";
import type { SettingsActionState } from "../types/settings.types";
import { Modal } from "@/shared/ui/modal";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { ROUTES } from "@/shared/config/routes";
import { INVITE_BLOCKED_MESSAGE } from "@/modules/billing/services/access-state-ui";
import { RestrictedActionTooltip, useAccessGate } from "@/modules/billing/components/access-state";

export function InviteMemberDialog({ limitReached, limitReason }: { limitReached: boolean; limitReason?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(inviteMember, {});
  const inviteGate = useAccessGate("invite");
  const disabled = limitReached || inviteGate.blocked;
  const disabledReason = inviteGate.blocked ? INVITE_BLOCKED_MESSAGE : limitReason;

  return (
    <>
      <RestrictedActionTooltip message={disabled ? (disabledReason ?? INVITE_BLOCKED_MESSAGE) : "Invite member"}>
        <Button type="button" onClick={() => setOpen(true)} disabled={disabled} title={disabled ? disabledReason : undefined}>
          <UserPlusIcon size={16} /> Invite member
        </Button>
      </RestrictedActionTooltip>
      {disabled && (
        <div className="text-right">
          <p className="text-xs text-text-muted">{disabledReason ?? "Достигнут лимит участников для текущего плана."}</p>
          <Link href={ROUTES.billing} className="text-xs font-medium text-text-primary underline underline-offset-4">
            Billing
          </Link>
        </div>
      )}
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Invite a member">
        <form action={action} className="space-y-5">
          <Input id="invite-email" name="email" type="email" label="Email" placeholder="teammate@example.com" error={state.fieldErrors?.email?.[0]} disabled={pending} required />
          <Select id="invite-role" name="role" label="Role" defaultValue="member" options={[{ value: "member", label: "Member" }, { value: "admin", label: "Admin" }]} error={state.fieldErrors?.role?.[0]} disabled={pending} />
          <p className="text-xs text-text-muted">The person must already have a Nevora account. Owner access cannot be assigned through invitations.</p>
          <p aria-live="polite" className={state.error ? "text-sm text-danger" : "text-sm text-accent-green"}>{state.error ?? state.success}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={pending}>{pending ? "Inviting…" : "Send invitation"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
