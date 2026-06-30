"use client";

import { useActionState, useState } from "react";
import { UserPlusIcon } from "lucide-react";
import { inviteMember } from "../actions/invite-member";
import type { SettingsActionState } from "../types/settings.types";
import { Modal } from "@/shared/ui/modal";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";

export function InviteMemberDialog({ limitReached, limitReason }: { limitReached: boolean; limitReason?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(inviteMember, {});

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} disabled={limitReached} title={limitReached ? limitReason : undefined}>
        <UserPlusIcon size={16} /> Invite member
      </Button>
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
