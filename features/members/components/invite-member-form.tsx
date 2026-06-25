"use client";

import { useActionState } from "react";
// Прямой импорт server action (НЕ из бочки @/modules/members — она реэкспортит
// server-only getMembers → next/headers попадёт в клиентский бандл).
import { inviteMemberAction } from "@/modules/members/actions/invite-member.action";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import type { ActionResult } from "@/lib/validators/common";

interface InviteMemberFormProps {
  /** true, если достигнут лимит участников плана. */
  limitReached?: boolean;
  limitReason?: string;
}

export function InviteMemberForm({ limitReached, limitReason }: InviteMemberFormProps) {
  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    inviteMemberAction,
    {},
  );

  if (limitReached) {
    return (
      <p className="text-sm text-text-muted">
        {limitReason ?? "You have reached your plan's member limit. Upgrade to add more."}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="role" value="member" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          id="invite-email"
          name="email"
          type="email"
          label="Invite by email"
          placeholder="teammate@email.com"
          error={state.fieldErrors?.email?.[0]}
          disabled={isPending}
          required
          className="sm:w-80"
        />
        <Button type="submit" isLoading={isPending}>
          {isPending ? "Inviting…" : "Send invite"}
        </Button>
      </div>

      {state.error && (
        <p className="text-xs text-danger" role="alert">
          {state.error}
        </p>
      )}

      <p className="text-xs text-text-muted">
        The person must already have a Nevora account. They&apos;ll see a pending
        invite and can accept it.
      </p>
    </form>
  );
}
