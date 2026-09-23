import Link from "next/link";
import { ShieldCheckIcon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";

export function DeveloperAccessBadge() {
  const label = "Developer Access · Unlimited product limits";

  return (
    <Link
      href={ROUTES.billing}
      data-testid="developer-access-badge"
      aria-label={label}
      title={label}
      className="soft-focus inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-transparent bg-transparent text-violet-600 transition-colors hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
    >
      <ShieldCheckIcon size={18} strokeWidth={1.75} aria-hidden="true" />
    </Link>
  );
}
