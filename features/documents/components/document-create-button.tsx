"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { RestrictedActionTooltip, useAccessGate } from "@/modules/billing/components/access-state";
import { UPLOAD_BLOCKED_MESSAGE } from "@/modules/billing/services/access-state-ui";
import { ROUTES } from "@/shared/config/routes";

export function DocumentCreateButton() {
  const { blocked } = useAccessGate("write");
  if (blocked) {
    return (
      <RestrictedActionTooltip message={UPLOAD_BLOCKED_MESSAGE}>
        <span
          aria-disabled="true"
          aria-label={`New Document. ${UPLOAD_BLOCKED_MESSAGE}`}
          className="inline-flex h-9 w-9 shrink-0 cursor-not-allowed items-center justify-center gap-2 rounded-full bg-text-primary p-0 text-text-inverse opacity-50 shadow-neu-control sm:h-auto sm:w-auto sm:rounded-(--neu-radius-pill) sm:px-5 sm:py-2.5"
        >
          <PlusIcon size={16} strokeWidth={2} />
          <span className="hidden sm:inline">New Document</span>
        </span>
      </RestrictedActionTooltip>
    );
  }
  return (
      <Link href={ROUTES.documentsNew}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full bg-text-primary p-0 text-text-inverse shadow-neu-control transition-all hover:shadow-neu-card sm:h-auto sm:w-auto sm:rounded-(--neu-radius-pill) sm:px-5 sm:py-2.5"
      >
        <PlusIcon size={16} strokeWidth={2} />
        <span className="hidden sm:inline">New Document</span>
      </Link>
  );
}
