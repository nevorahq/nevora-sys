"use client";

import { useActionState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { updateBookingRequestStatusAction } from "../actions/update-request-status.action";
import type { ActionResult } from "@/lib/validators/common";

/** Server-action controls shared by desktop and mobile request lists. */
export function BookingRequestActions({ requestId }: { requestId: string }) {
  const [state, formAction, isPending] = useActionState<ActionResult, FormData>(
    updateBookingRequestStatusAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <button
        type="submit"
        name="status"
        value="accepted"
        disabled={isPending}
        className="inline-flex items-center gap-1 rounded-(--neu-radius-sm) bg-accent-green-soft px-2.5 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-accent-green-soft/70 disabled:opacity-50"
      >
        <CheckIcon size={13} />
        {isPending ? "Saving…" : "Accept"}
      </button>
      <button
        type="submit"
        name="status"
        value="rejected"
        disabled={isPending}
        className="inline-flex items-center gap-1 rounded-(--neu-radius-sm) px-2.5 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger-soft disabled:opacity-50"
      >
        <XIcon size={13} />
        Reject
      </button>
      {state.error && <p className="basis-full text-right text-xs text-danger">{state.error}</p>}
    </form>
  );
}
