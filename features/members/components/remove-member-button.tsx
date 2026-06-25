"use client";

import { useState, useTransition } from "react";
import { Trash2Icon } from "lucide-react";
import { removeMemberAction } from "@/modules/members/actions/remove-member.action";

export function RemoveMemberButton({ memberId, memberName }: { memberId: string; memberName: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function removeMember() {
    if (!window.confirm(`Remove ${memberName} from this organization?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await removeMemberAction(memberId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={removeMember}
        disabled={isPending}
        className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
        aria-label={`Remove ${memberName}`}
      >
        <Trash2Icon size={14} />
        {isPending ? "Removing…" : "Remove"}
      </button>
      {error && <p className="max-w-48 text-right text-[11px] text-danger">{error}</p>}
    </div>
  );
}
