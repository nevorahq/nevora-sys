"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { RestrictedActionTooltip, useAccessGate, useAccessState } from "@/modules/billing/components/access-state";
import { ROUTES } from "@/shared/config/routes";

export function DocumentCreateButton({ label }: { label: string }) {
  const { blocked } = useAccessGate("write");
  // Localized plan-gate copy from the AccessState context (dict.access).
  const uploadBlockedMessage = useAccessState().blocked.upload;
  if (blocked) {
    return (
      <RestrictedActionTooltip message={uploadBlockedMessage}>
        <span
          aria-disabled="true"
          aria-label={`${label}. ${uploadBlockedMessage}`}
          className="inline-flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center gap-2 rounded-full bg-text-primary p-0 text-text-inverse opacity-50 shadow-neu-control sm:h-auto sm:w-auto sm:rounded-(--neu-radius-pill) sm:px-5 sm:py-2.5"
        >
          <PlusIcon size={16} strokeWidth={2} />
          <span className="hidden sm:inline">{label}</span>
        </span>
      </RestrictedActionTooltip>
    );
  }
  return (
      <Link href={ROUTES.documentsNew}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full bg-text-primary p-0 text-text-inverse shadow-neu-control transition-all hover:shadow-neu-card sm:h-auto sm:w-auto sm:rounded-(--neu-radius-pill) sm:px-5 sm:py-2.5"
      >
        <PlusIcon size={16} strokeWidth={2} />
        <span className="hidden sm:inline">{label}</span>
      </Link>
  );
}
