"use client";

import { useActionState } from "react";
import { acceptInviteLinkAction } from "@/modules/members/actions/accept-invite-link.action";
import { Button } from "@/shared/ui/button";
import type { ActionResult } from "@/lib/validators/common";

export function AcceptInviteButton({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    acceptInviteLinkAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" isLoading={isPending} className="w-full">
        {isPending ? "Joining…" : "Accept invite"}
      </Button>
      {state.error && (
        <p className="text-xs text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
