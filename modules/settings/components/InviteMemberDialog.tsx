"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { UserPlusIcon } from "lucide-react";
import { inviteMember } from "../actions/invite-member";
import type { SettingsActionState } from "../types/settings.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { Modal } from "@/shared/ui/modal";
import { Input } from "@/shared/ui/input";
import { Select } from "@/shared/ui/select";
import { Button } from "@/shared/ui/button";
import { ROUTES } from "@/shared/config/routes";
import { RestrictedActionTooltip, useAccessGate } from "@/modules/billing/components/access-state";

export function InviteMemberDialog({
  limitReached,
  limitReason,
  t,
}: {
  limitReached: boolean;
  limitReason?: string;
  t: Dictionary["settings"];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(inviteMember, {});
  const inviteGate = useAccessGate("invite");
  const m = t.members;
  const disabled = limitReached || inviteGate.blocked;
  const disabledReason = inviteGate.blocked ? inviteGate.message : limitReason;

  return (
    <>
      <RestrictedActionTooltip message={disabled ? (disabledReason ?? m.limitReached) : m.inviteTooltip}>
        <Button type="button" onClick={() => setOpen(true)} disabled={disabled} title={disabled ? disabledReason : undefined}>
          <UserPlusIcon size={16} /> {m.invite}
        </Button>
      </RestrictedActionTooltip>
      {disabled && (
        <div className="text-right">
          <p className="text-xs text-text-muted">{disabledReason ?? m.limitReached}</p>
          <Link href={ROUTES.billing} className="text-xs font-medium text-text-primary underline underline-offset-4">
            {t.nav.billing}
          </Link>
        </div>
      )}
      <Modal isOpen={open} onClose={() => setOpen(false)} title={m.modalTitle}>
        <form action={action} className="space-y-5">
          <Input id="invite-email" name="email" type="email" label={m.emailLabel} placeholder="teammate@example.com" error={state.fieldErrors?.email?.[0]} disabled={pending} required />
          <Select id="invite-role" name="role" label={m.roleLabel} defaultValue="member" options={[{ value: "member", label: m.roleMember }, { value: "admin", label: m.roleAdmin }]} error={state.fieldErrors?.role?.[0]} disabled={pending} />
          <p className="text-xs text-text-muted">{m.inviteNote}</p>
          <p aria-live="polite" className={state.error ? "text-sm text-danger" : "text-sm text-accent-green"}>{state.error ?? state.success}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t.common.cancel}</Button>
            <Button type="submit" isLoading={pending}>{pending ? m.sending : m.sendInvite}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
