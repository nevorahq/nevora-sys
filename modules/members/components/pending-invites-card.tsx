"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { MailIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ROUTES } from "@/shared/config/routes";
import { acceptInviteAction } from "../actions/accept-invite.action";
import { declineInviteAction } from "../actions/decline-invite.action";
import type { PendingInvite } from "../queries/get-pending-invites";
import type { ActionResult } from "@/lib/validators/common";

interface PendingInvitesCardProps {
  invites: PendingInvite[];
  /** После успешного accept — перейти в /dashboard (используется на онбординге,
   * где у пользователя иначе нет активной организации). */
  redirectOnAccept?: boolean;
}

/** Карточка pending-приглашений. Ничего не рендерит, если приглашений нет. */
export function PendingInvitesCard({ invites, redirectOnAccept = false }: PendingInvitesCardProps) {
  if (invites.length === 0) return null;

  return (
    <div className="soft-card-sm space-y-3 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <MailIcon size={15} className="text-text-muted" />
        Pending invitations
      </p>
      <ul className="space-y-2">
        {invites.map((invite) => (
          <PendingInviteRow key={invite.organizationId} invite={invite} redirectOnAccept={redirectOnAccept} />
        ))}
      </ul>
    </div>
  );
}

function PendingInviteRow({
  invite,
  redirectOnAccept,
}: {
  invite: PendingInvite;
  redirectOnAccept: boolean;
}) {
  const router = useRouter();
  const [acceptState, acceptFormAction, acceptPending] = useActionState<ActionResult, FormData>(
    acceptInviteAction,
    {},
  );
  const [declineState, declineFormAction, declinePending] = useActionState<ActionResult, FormData>(
    declineInviteAction,
    {},
  );
  const wasAccepting = useRef(false);
  const wasDeclining = useRef(false);

  // useActionState не даёт onSuccess-колбэк — отслеживаем переход
  // pending → не-pending без ошибки как признак завершённого запроса.
  useEffect(() => {
    if (wasAccepting.current && !acceptPending && !acceptState.error) {
      if (redirectOnAccept) router.push(ROUTES.dashboard);
      else router.refresh();
    }
    wasAccepting.current = acceptPending;
  }, [acceptPending, acceptState.error, redirectOnAccept, router]);

  useEffect(() => {
    if (wasDeclining.current && !declinePending && !declineState.error) {
      router.refresh();
    }
    wasDeclining.current = declinePending;
  }, [declinePending, declineState.error, router]);

  const busy = acceptPending || declinePending;

  return (
    <li className="flex items-center justify-between gap-3 rounded-(--neu-radius) bg-surface-sunken px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text-primary">{invite.organizationName}</p>
        <p className="text-xs capitalize text-text-muted">Invited as {invite.role}</p>
        {(acceptState.error || declineState.error) && (
          <p className="mt-1 text-xs text-danger" role="alert">
            {acceptState.error || declineState.error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <form action={declineFormAction}>
          <input type="hidden" name="organizationId" value={invite.organizationId} />
          <Button type="submit" variant="ghost" disabled={busy} isLoading={declinePending}>
            Decline
          </Button>
        </form>
        <form action={acceptFormAction}>
          <input type="hidden" name="organizationId" value={invite.organizationId} />
          <Button type="submit" variant="secondary" disabled={busy} isLoading={acceptPending}>
            Accept
          </Button>
        </form>
      </div>
    </li>
  );
}
