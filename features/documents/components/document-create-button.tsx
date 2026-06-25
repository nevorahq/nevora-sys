import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { ROUTES } from "@/shared/config/routes";

export function DocumentCreateButton() {
  return (
      <Link href={ROUTES.documentsNew}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-full bg-text-primary p-0 text-text-inverse shadow-neu-control transition-all hover:shadow-neu-card sm:h-auto sm:w-auto sm:rounded-(--neu-radius-pill) sm:px-5 sm:py-2.5"
      >
        <PlusIcon size={16} strokeWidth={2} />
        <span className="hidden sm:inline">New Document</span>
      </Link>
  );
}
