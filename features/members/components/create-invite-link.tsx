"use client";

import { useActionState, useState } from "react";
// Прямой импорт server action (не из бочки @/modules/members — там server-only queries).
import {
  createInviteLinkAction,
  type CreateInviteLinkResult,
} from "@/modules/members/actions/create-invite-link.action";
import { Button } from "@/shared/ui/button";

interface CreateInviteLinkProps {
  limitReached?: boolean;
  limitReason?: string;
}

export function CreateInviteLink({ limitReached, limitReason }: CreateInviteLinkProps) {
  const [state, formAction, isPending] = useActionState<CreateInviteLinkResult, FormData>(
    createInviteLinkAction,
    {},
  );
  const [copied, setCopied] = useState(false);

  const link =
    state.token && typeof window !== "undefined"
      ? `${window.location.origin}/invite/${state.token}`
      : "";

  if (limitReached) {
    return (
      <p className="text-sm text-text-muted">
        {limitReason ?? "You have reached your plan's member limit. Upgrade to add more."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction}>
        <input type="hidden" name="role" value="member" />
        <Button type="submit" isLoading={isPending}>
          {isPending ? "Creating…" : "Create invite link"}
        </Button>
      </form>

      {state.error && (
        <p className="text-xs text-danger" role="alert">
          {state.error}
        </p>
      )}

      {link && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-muted">
            Share this link with the person you want to invite. They&apos;ll join
            after opening it and signing in.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="soft-control w-full px-3 py-2 text-xs"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                navigator.clipboard?.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
