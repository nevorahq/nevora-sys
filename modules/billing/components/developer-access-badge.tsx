import Link from "next/link";
import { ShieldCheckIcon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";

export function DeveloperAccessBadge() {
  return (
    <Link
      href={ROUTES.billing}
      data-testid="developer-access-badge"
      title="Developer Access · Unlimited product limits"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 transition-colors hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-200 dark:hover:bg-violet-900/70"
    >
      <ShieldCheckIcon size={13} aria-hidden="true" />
      <span>Developer</span>
      <span className="hidden text-violet-500 sm:inline dark:text-violet-400">· Unlimited</span>
    </Link>
  );
}
