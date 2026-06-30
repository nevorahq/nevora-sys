"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListTodoIcon, FolderKanbanIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { ROUTES } from "@/shared/config/routes";

/**
 * Tabs inside the Tasks area: All Tasks | Projects.
 *
 * Kept intentionally light — the brief calls for a simple two-view switch
 * (Inbox / My Tasks can be added later without restructuring).
 */
const TABS = [
  { href: ROUTES.tasks, label: "All Tasks", icon: ListTodoIcon, exact: true },
  { href: ROUTES.projects, label: "Projects", icon: FolderKanbanIcon, exact: false },
];

export function TasksSubnav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1.5">
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-(--neu-radius-pill) px-4 py-1.5 text-sm font-medium transition-all duration-150",
              active
                ? "bg-text-primary text-text-inverse shadow-neu-control"
                : "text-text-secondary hover:bg-surface hover:shadow-neu-sm",
            )}
          >
            <Icon size={15} strokeWidth={active ? 2.25 : 1.75} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
