import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";

/**
 * Global capture entry point (Sprint 2 — S2.3).
 *
 * One "+ Add" button, always present in the dashboard top bar, so a user can
 * start capturing from ANY section. It routes to the Inbox, which already hosts
 * the multimodal capture composer (text / file / photo) and sends
 * low-confidence items to review — so this is a single, reversible entry point,
 * not a new capture surface.
 *
 * Rendered inside the server layout: a plain Link needs no client boundary.
 */
export function GlobalCaptureButton({ label }: { label: string }) {
  return (
    <Link
      href={ROUTES.inbox}
      title={label}
      className="inline-flex items-center gap-1.5 rounded-(--neu-radius-pill) bg-text-primary px-3 py-2 text-sm font-medium text-text-inverse shadow-neu-control transition-all hover:shadow-neu-card"
    >
      <PlusIcon size={16} strokeWidth={2} className="shrink-0" />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
